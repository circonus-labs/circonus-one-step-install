/*eslint-env node, es6 */
/*eslint-disable no-magic-numbers, no-process-exit, camelcase, no-process-env */

"use strict";

const path = require("path");
const url = require("url");
const util = require("util");
const ProxyAgent = require("https-proxy-agent");

const options = require("commander");

const CERT_URL = "http://login.circonus.com/pki/ca.crt";
const DEFAULT_CONFIG_FILE = "/opt/circonus/etc/circonus-nadpush.json";
const DEFAULT_GROUP = "nobody";
const DEFAULT_NAD_URL = "http://127.0.0.1:2609/";
const DEFAULT_POLL_INTERVAL = 60;
const DEFAULT_REQUEST_TIMEOUT = 15;
const DEFAULT_SILENT = false;
const DEFAULT_USER = "nobody";
const DEFAULT_VERBOSE = false;

let instance = null;

function getProxySettings(urlProtocol) {
    let proxyServer = null;

    if (urlProtocol === "http:") {
        if (process.env.hasOwnProperty("http_proxy")) {
            proxyServer = process.env.http_proxy;
        }
        else if (process.env.hasOwnProperty("HTTP_PROXY")) {
            proxyServer = process.env.HTTP_PROXY;
        }
    }
    else if (urlProtocol === "https:") {
        if (process.env.hasOwnProperty("https_proxy")) {
            proxyServer = process.env.https_proxy;
        }
        else if (process.env.hasOwnProperty("HTTPS_PROXY")) {
            proxyServer = process.env.HTTPS_PROXY;
        }
    }
    if (proxyServer !== null && proxyServer !== "") {
        if (!proxyServer.match(/^http[s]?:\/\//)) {
            proxyServer = `http://${proxyServer}`;
        }
    }

    return proxyServer;
}

class Settings {
    constructor() {
        if (instance !== null) {
            return instance;
        }

        instance = this; //eslint-disable-line consistent-this

        this.name = "circonus-nadpush";
        this.version = "1.0.0";
        this.cert_file = null;
        this.cert_url = null;
        this.check_url = null;
        this.group = null;
        this.nad_url = null;
        this.poll_interval = null;
        this.poller = null;
        this.request_timeout = null;
        this.silent = false;
        this.user = null;
        this.verbose = false;
        this.send_req_opts = {};

        // parse command line options
        options.
            version(this.version).
            option("-c, --config <path>", util.format("JSON configuration file [none] e.g. %s", DEFAULT_CONFIG_FILE), null).
            option("-i, --interval <n>", util.format("Polling interval [%d] seconds", DEFAULT_POLL_INTERVAL), null).
            option("-t, --timeout <n>", util.format("Request timeout [%d] seconds", DEFAULT_POLL_INTERVAL), null).
            option("-u, --user <user>", util.format("User to run daemon as [%s]", DEFAULT_USER), null).
            option("-g, --group <group>", util.format("Group to run daemon as [%s]", DEFAULT_GROUP), null).
            option("--nad_url <url>", util.format("NAD URL [%s]", DEFAULT_NAD_URL), null).
            option("--check_url <url>", "HTTPTRAP check URL [none]", null).
            option("--cert_url <url>", util.format("Broker CA certificate URL [%s]", CERT_URL), null).
            option("--cert_file <path>", "Broker CA certificate file [none]", null).
            option("-v, --verbose", "Output more verbose log lines [false] verbose takes precedence over silent.", null).
            option("-s, --silent", "Output no messages at all [false]. Use to silence output re:sent metrics.", null).
            parse(process.argv);

        // load config, if specified
        let config = {};

        if (options.config !== null) {
            try {
                config = require(path.resolve(options.config)); // eslint-disable-line global-require
            }
            catch (err) {
                // fail, if a config file is specified and there is an error loading it
                console.error(err);
                process.exit(1);
            }
        }

        // merge command line, config, and default options
        this.poll_interval = options.interval || config.poll_interval || DEFAULT_POLL_INTERVAL;
        this.request_timeout = options.timeout || config.request_timeout || DEFAULT_REQUEST_TIMEOUT;
        this.user = options.user || config.user || DEFAULT_USER;
        this.group = options.group || config.group || DEFAULT_GROUP;

        this.nad_url = url.parse(options.nad_url || config.nad_url || DEFAULT_NAD_URL);

        this.silent = options.silent || config.silent || DEFAULT_SILENT;
        this.verbose = options.verbose || config.verbose || DEFAULT_VERBOSE;
        if (this.verbose) {
            this.silent = false;
        }

        const check_url = options.check_url || config.check_url || null;

        if (check_url === null) {
            console.error("A valid Circonus HTTPTRAP check submission URL is required, on command line or in a configuration file.");
            options.outputHelp();
            process.exit(1);
        }
        this.check_url = url.parse(check_url);

        let cert_url = options.cert_url || config.cert_url || null;

        this.cert_file = options.cert_file || config.cert_file || null;
        if (this.cert_file === null && cert_url === null) {
            cert_url = CERT_URL;
        }
        if (cert_url !== null) {
            this.cert_url = url.parse(cert_url);
            const proxyServer = getProxySettings(this.cert_url.protocol);

            if (proxyServer !== null) {
                this.cert_url.agent = new ProxyAgent(proxyServer);
            }
        }

        if (this.check_url === null) {
            console.error("A valid Circonus HTTPTRAP check submission URL is required, on command line or in a configuration file.");
            options.outputHelp();
            process.exit(1);
        }
        else {
            this.send_req_opts = url.parse(this.check_url);
            const proxyServer = getProxySettings(this.send_req_opts.protocol);

            if (proxyServer !== null) {
                this.send_req_opts.agent = new ProxyAgent(proxyServer);
                this.send_req_opts.timeout = 15 * 1000;
            }
            this.send_req_opts.method = "PUT";
            this.send_req_opts.headers = {
                "Content-Type": "application/json",
                "Accept": "application/json"
            };
            this.send_req_opts.ca = [];
            // adding support to leverage CN/external_hostname to avoid
            // no IP SANS type of errors. (derived submission URLs *shouldn't*
            // this as they will use broker's external_hostname:external_port
            // from the details[x] record with ip associated in mtev_reverse url)
            if (config.broker_servername) {
                this.send_req_opts.servername = config.broker_servername;
            }
        }

        const cmdline = process.argv.slice(2);

        cmdline.unshift(this.name);
        process.title = cmdline.join(" ");

        // drop privileges (on non-windows platforms)
        if (this.user !== null) {
            if (process.platform !== "win32") {
                if (this.group !== null) {
                    process.setgid(this.group);
                }
                process.setuid(this.user);
            }
        }

        return instance;
    }
}

module.exports = new Settings();

// END

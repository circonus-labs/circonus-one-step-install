/*eslint-env node, es6 */
/*eslint-disable no-process-exit */

"use strict";

// load core modules
const fs = require("fs");
const path = require("path");

// load local modules
const options = require("commander");

// load package.json to centralize name and version
const pkg = require(path.resolve(path.join(__dirname, "..", "..", "package.json")));

function config_error(msg) {
    console.error(`CONFIGURATION ERROR: ${msg}`);
    process.exit(1); //eslint-disable-line no-process-exit, no-magic-numbers
}

//
// broker list - the broker endpoint is *ONLY* used if:
//  1. a broker is not specified on the command line or in the config file for cosi-install/cosi-register
//  2. and, there is no default broker defined in the account api endpoint
//  3. and, there are no entprise brokers listed in the broker api endpoint
//
// note: enterprise broker users, if no broker is explicity specified, the *FIRST* enterprise broker
//       encountered will be used for cosi-install/cosi-register.
//
const BROKER_HTTPTRAP = 35;
const BROKER_ARLINGTON = 1;
const BROKER_SANJOSE = 2;
const BROKER_CHICAGO = 275;
const DEFAULT_BROKER_LIST = {
    // if there isn't a broker config for the specific type of check,
    // the fallback will/should be used.
    fallback: [
        BROKER_ARLINGTON,
        BROKER_SANJOSE,
        BROKER_CHICAGO
    ],
    fallback_default: 2,         // 0 based index or -1 for random
    httptrap: [
        BROKER_HTTPTRAP
    ],
    httptrap_default: 0,         // 0 based index or -1 for random
    json: [
        BROKER_ARLINGTON,
        BROKER_SANJOSE,
        BROKER_CHICAGO
    ],
    json_default: 2             // 0 based index or -1 for random
};

let instance = null;
const defaults = {
    listen: "0.0.0.0",
    port: 80,
    user: null,
    group: null,
    log_dir: path.join(".", "log"),
    log_level: "info",
    log_rotation: "1d",
    log_keep_max: 8,
    package_list: path.join(".", "etc", "circonus-packages.json"),
    package_url: "http://updates.circonus.net/node-agent/packages",
    ssl_port: 443,
    ssl_cert_file: null,
    ssl_key_file: null,
    default_broker_list: DEFAULT_BROKER_LIST,
    cache_templates: true
};

class Settings {
    constructor() {
        if (instance !== null) {
            return instance;
        }

        //
        // default settings
        //
        const DEFAULT_CONFIG_FILE = path.join(".", "etc", "cosi-site.json"); // there isn't one

        //
        // internal variables
        //
        const BASE_10 = 10;
        let log_dir = null;
        let pkg_list_file = null;
        let cfg_file = null;
        let cfg = {};

        instance = this; //eslint-disable-line consistent-this
        this.time = new Date();
        this.base_dir = path.resolve(__dirname, "..", "..");
        this.config_file = null;
        //
        // send all logging to console if log_dir is set to this "string"
        //
        this.CONSOLE_LOG = "stdout";

        this.app_name = pkg.name;
        this.app_version = pkg.version;

        //
        // set process name
        //
        const cmdline = process.argv.slice(2); //eslint-disable-line no-magic-numbers

        cmdline.unshift(this.app_name);
        process.title = cmdline.join(" ");

        //
        // command line options (parsed by commander)
        //
        options.
            version(this.version).
            option("-c, --config <file>", `JSON configuration file [${DEFAULT_CONFIG_FILE}]`, null).
            option("-p, --port <n>", `port to listen on [${defaults.port}|${defaults.ssl_port} w/cert]`, null).
            option("-l, --listen <ip>", `ip to listen on [${defaults.listen}]`, null).
            option("-u, --user <current>", "user to drop to on daemon start [current user]", null).
            option("--log_dir <path>", `log directory (path|stdout) [${defaults.log_dir}]`, null).
            option("--log_level <level>", `logging level (trace|debug|info|warn|error|fatal) [${defaults.log_level}]`, null).
            option("--log_keep_max <n>", `max rotated logs to keep [${defaults.log_keep_max}]`, null).
            option("--log_rotation <period>", `log rotation period #(h|d|w|m|y) [${defaults.log_rotation}]`, null).
            option("--package_url <url>", `package URL [${defaults.package_url}]`, null).
            option("--package_list <path>", `JSON package list [${defaults.package_list}]`, null).
            option("--cert <path>", "SSL certificate file", null).
            option("--cert_key <path>", "SSL certificate key file", null).
            option("--print_conf [type]", "Print the configuration and exit (run|default)[default].", false).
            parse(process.argv);


        if (options.config === null) {
            cfg_file = path.resolve(this.base_dir, DEFAULT_CONFIG_FILE);
            try {
                cfg = require(cfg_file); //eslint-disable-line global-require
                this.config_file = cfg_file;
            }
            catch (err) {
                if (err.code !== "MODULE_NOT_FOUND") {
                    config_error(`Loading configuration file ${cfg_file}: ${err}`);
                }
            }
        }
        else {
            if (options.config.substr(0, 1) === "/") { //eslint-disable-line no-magic-numbers
                cfg_file = path.resolve(options.config);
            }
            else {
                cfg_file = path.resolve(this.base_dir, options.config);
            }

            try {
                cfg = require(cfg_file); //eslint-disable-line global-require
                this.config_file = cfg_file;
            }
            catch (err) {
                if (err.code === "MODULE_NOT_FOUND") {
                    config_error(`Config file ${cfg_file} not found.`);
                }
                else {
                    config_error(`Loading configuration file ${cfg_file}: ${err}`);
                }
            }
        }

        //
        // merge into settings by precedence:
        //
        //  command line, then configuration file, and finally backfill with defaults.
        //
        this.port = options.port || cfg.port || defaults.port;
        this.listen = options.listen || cfg.listen || defaults.listen;
        this.user = options.user || cfg.user || defaults.user;

        this.template_dir = path.resolve(this.base_dir, "content", "templates");
        try {
            fs.accessSync(this.template_dir, fs.R_OK);
        }
        catch (err) {
            config_error(`Templates directory:\n${err}`);
        }
        this.cache_templates = options.cache_templates || cfg.cache_templates || defaults.cache_templates;

        log_dir = options.log_dir || cfg.log_dir || defaults.log_dir;
        // resolve the log_dir path if it is not set to stdout (for Docker or manual runs)
        if (log_dir === this.CONSOLE_LOG) {
            this.log_dir = log_dir;
        }
        else {
            if (log_dir.substr(0, 1) === "/") { //eslint-disable-line no-magic-numbers
                this.log_dir = path.resolve(log_dir);
            }
            else {
                this.log_dir = path.resolve(this.base_dir, log_dir);
            }
            // verify access to the designated directory or switch back to stdout
            try {
                fs.accessSync(this.log_dir, fs.W_OK);
            }
            catch (err) {
                config_error(`Log directory '${this.log_dir}' ${err}`);
            }
        }

        this.log_level = options.log_level || cfg.log_level || defaults.log_level;
        if (!this.log_level.match(/^(trace|debug|info|warn|error|fatal)$/)) {
            config_error(`Invalid log_level '${this.log_level}'`);
        }
        this.log_rotation = options.log_rotation || cfg.log_rotation || defaults.log_rotation;
        if (!this.log_rotation.match(/^\d+(h|d|w|m|y)$/)) {
            config_error(`Invalid log_rotation '${this.log_rotation}'`);
        }
        this.log_keep_max = parseInt(options.log_keep_max || cfg.log_keep_max || defaults.log_keep_max, BASE_10);
        if (this.log_keep_max <= 0) { //eslint-disable-line no-magic-numbers
            config_error(`Invalid log_keep_max '${this.log_keep_max}'`);
        }

        this.package_url = options.package_url || cfg.package_url || defaults.package_url;
        if (this.package_url.slice(-1) !== "/") { //eslint-disable-line no-magic-numbers
            this.package_url += "/";
        }

        pkg_list_file = options.package_list || cfg.package_list || defaults.package_list;
        if (pkg_list_file.substr(0, 1) === "/") { //eslint-disable-line no-magic-numbers
            this.package_list_file = path.resolve(pkg_list_file);
        }
        else {
            this.package_list_file = path.resolve(this.base_dir, pkg_list_file);
        }

        // note, no command line option. only user config, user is responsible for ensuring the configuration adheres
        // to the format of DEFAULT_BROKER_LIST defined above.
        this.default_broker_list = cfg.default_broker_list || defaults.default_broker_list;

        // backfill the required types from default if they do not exist in a custom config
        // because these are the ones cosi will use to create checks.
        const requiredBrokerTypes = [ "fallback", "httptrap", "json" ];

        for (let i = 0; i < requiredBrokerTypes.length; i++) {
            const brokerType = requiredBrokerTypes[i];
            const brokerTypeDefault = `${brokerType}_default`;

            if (!this.default_broker_list.hasOwnProperty(brokerType)) {
                this.default_broker_list[brokerType] = DEFAULT_BROKER_LIST[brokerType];
            }
            if (!this.default_broker_list.hasOwnProperty(brokerTypeDefault)) {
                this.default_broker_list[brokerTypeDefault] = DEFAULT_BROKER_LIST[brokerTypeDefault];
            }
        }

        // verify a minimum of "fallback" broker
        if (!(this.default_broker_list.hasOwnProperty("fallback") && this.default_broker_list.hasOwnProperty("fallback_default"))) {
            config_error("Invalid broker configuration, no fallback broker defined.");
        }

        //
        // SSL enablement
        //
        this.ssl_cert_file = options.cert || cfg.cert || defaults.ssl_cert_file;
        this.ssl_key_file = options.cert_key || cfg.cert_key || defaults.ssl_key_file;
        if (this.ssl_cert_file !== null && this.ssl_key_file !== null) {
            if (this.ssl_cert_file.substr(0, 1) === "/") { //eslint-disable-line no-magic-numbers
                this.ssl_cert_file = path.resolve(this.ssl_cert_file);
            }
            else {
                this.ssl_cert_file = path.resolve(this.base_dir, this.ssl_cert_file);
            }
            if (this.ssl_cert_file.substr(0, 1) === "/") { //eslint-disable-line no-magic-numbers
                this.ssl_cert_file = path.resolve(this.ssl_cert_file);
            }
            else {
                this.ssl_cert_file = path.resolve(this.base_dir, this.ssl_cert_file);
            }

            // switch to 443 if default [http]port is still set.
            if (this.port === defaults.port) {
                this.port = defaults.ssl_port;
            }
        }

        //
        // installer rpm
        //
        this.installer_rpm_file = cfg.installer_rpm_file || null;
        if (this.installer_rpm_file !== null) {
            const rpm_file = path.resolve(path.join(this.base_dir, "content", "files", this.installer_rpm_file));

            try {
                fs.accessSync(rpm_file, fs.R_OK);
            }
            catch (err) {
                config_error(`with file specified in 'installer_rpm_file': ${err}`);
            }
        }

        if (options.print_conf) {
            this.print(options.print_conf);
            process.exit(0); //eslint-disable-line no-process-exit, no-magic-numbers
        }

        return instance;
    }

    print(use_default) {
        const show_default = use_default !== "run" || false;

        console.log(JSON.stringify(show_default ? defaults : this, null, 4)); //eslint-disable-line no-magic-numbers
    }
}

module.exports = new Settings();

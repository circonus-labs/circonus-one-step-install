/**
 * Tiny library for interacting with Circonus' API v2
 *
 * Exported methods
 *  setup:  inital setup function to give the API your auth token an app name
 *  get, post, put, delete: docs for each method below, are proxies for the
 *                          various methods for REST calls
 *
 * Notes:
 *  callback functions take 3 args (code, error, body)
 *    code:   HTTP Response code, if null a non HTTP error occurred
 *    error:  Error message from API, null on 200 responses
 *    body:   Response body, i.e. the thing you probably want
 */

/*eslint-env node, es6 */
/*eslint-disable no-magic-numbers, camelcase, no-process-exit, global-require, no-param-reassign */

/*eslint-disable no-invalid-this, no-process-env, valid-jsdoc */

"use strict";

const qs = require("querystring");
const url = require("url");
const http = require("http");
const https = require("https");

let singleton = null;

const Api = function(token, app, options) {
    options = options || "https://api.circonus.com/v2/";
    if (typeof options === "string") {
        options = url.parse(options);
    }
    this.authtoken = token;
    this.appname = app;
    this.protocol = options.protocol || "https:";
    this.apihost = options.host || "api.circonus.com";
    this.apiport = options.port || 443;
    this.apipath = options.path || "/v2/";
    this.verbose = options.verbose;
};

/**
 * GET:
 *
 *  endpoint: (/check_bundle, /check/1, etc.)
 *  data:     object which will be converted to a query string
 *  callback: what do we call when the response from the server is complete,
 *            arguments are callback(code, error, body)
 */
Api.prototype.get = function(endpoint, data, callback) {
    const options = this.get_request_options("GET", endpoint, data);

    this.do_request(options, callback);
};


/**
 * POST:
 *
 *  endpoint: specify an object collection (/check_bundle, /graph, etc.)
 *  data:     object which will be stringified to JSON and written to the server
 *  callback: what do we call when the response from the server is complete,
 *            arguments are callback(code, error, body)
 */
Api.prototype.post = function(endpoint, data, callback) {
    const options = this.get_request_options("POST", endpoint, data);

    this.do_request(options, callback);
};

/**
 * PUT:
 *
 *  endpoint: specify an exact object (/check_bundle/1, /template/2, etc.)
 *  data:     object which will be stringified to JSON and written to the server
 *  callback: what do we call when the response from the server is complete,
 *            arguments are callback(code, error, body)
 */
Api.prototype.put = function(endpoint, data, callback) {
    const options = this.get_request_options("PUT", endpoint, data);

    this.do_request(options, callback);
};

/**
 * DELETE:
 *
 *  endpoint: specify an exact object (/check_bundle/1, /rule_set/1_foo, etc.)
 *  callback: what do we call when the response from the server is complete,
 *            arguments are callback(code, error, body)
 */
Api.prototype.delete = function(endpoint, callback) {
    const options = this.get_request_options("DELETE", endpoint);

    this.do_request(options, callback);
};

/**
 * This is called from the various exported functions to actually perform
 * the request.  Will retry up to 5 times in the event we get a connection
 * reset error.
 */
Api.prototype.do_request = function(options, callback) {
    const self = this;

    if (self.verbose) {
        console.error(`${options.method} REQUEST:`);
    }

    const client = options.protocol === "https:" ? https : http;

    const req = client.request(options, (res) => {
        let body = "";

        res.on("data", (chunk) => {
            body += chunk;
        });

        res.on("end", () => {
            let err_msg = null;

            if (self.verbose) {
                console.error(`RESPONSE ${res.statusCode} : ${body}`);
            }

            // If this isn't a 200 level, extract the message from the body
            if ( res.statusCode < 200 || res.statusCode > 299 ) {
                try {
                    err_msg = JSON.parse(body).message;
                }
                catch (err) {
                    err_msg = `An error occurred, but the body could not be parsed: ${err}`;
                }
            }

            let parsed = null;

            try {
                if ( body ) {
                    parsed = JSON.parse(body);
                }
            }
            catch ( unused ) {
                // ignore
            }

            callback(res.statusCode, err_msg, parsed, body);
        });
    });

    req.on("error", (e) => {
        if ( e.code === "ECONNRESET" && options.circapi.retry < 5 ) {
            options.circapi.retry += 1;
            // sleep 1 second and try again, probably hit the rate limit
            setTimeout(() => {
                self.do_request(options, callback);
            }, 1000 * options.circapi.retry);
        }
        else {
            e.detail = options;
            callback(null, e, null); //eslint-disable-line callback-return
        }
    });

    if ( options.method.toUpperCase() === "POST" || options.method.toUpperCase() === "PUT" ) {
        const stringified = JSON.stringify(options.circapi.data);

        req.write(stringified);
        if (self.verbose) {
            console.error(stringified);
        }
    }

    req.end();
};

/**
 * Hands back an options object suitable to use with the HTTPS class
 */
Api.prototype.get_request_options = function(method, endpoint, data) {
    // ensure valid url object with all required variables initialized

    const options = url.parse(url.format(
        {
            protocol: this.protocol,
            host: this.apihost,
            port: this.apiport,
            path: this.apipath
        }
    ));

    options.method = method.toUpperCase();
    options.agent = false;
    options.headers = {
        "X-Circonus-Auth-Token": this.authtoken,
        "X-Circonus-App-Name": this.appname,
        "Accept": "application/json" };
    options.circapi = {
        retry: 0,
        data: null
    };

    // const options = {
    //     protocol: this.protocol,
    //     host: this.apihost,
    //     port: this.apiport,
    //     path: this.apipath,
    //     method: method.toUpperCase(),
    //     agent: false,
    //     headers: {
    //         "X-Circonus-Auth-Token": this.authtoken,
    //         "X-Circonus-App-Name": this.appname,
    //         "Accept": "application/json"
    //     },
    //     circapi: {
    //         retry: 0,
    //         data: null
    //     }
    // };

    options.circapi.data = data;
    if (options.method === "POST" || options.method === "PUT" && data ) {
        options.headers["Content-Length"] = JSON.stringify(data).length;
    }

    if ( endpoint.match(/^\//) ) {
        endpoint = endpoint.substring(1);
    }

    options.path += endpoint;
    if ( options.method === "GET" && data !== null && Object.keys(data).length !== 0 ) {
        options.path += `?${qs.stringify(data)}`;
    }

    options.pathname = options.path;

    if (this.protocol === "https:") {
        // check for https proxy environment variable
        let httpsProxy = null;
        let proxyServer = null;

        if (process.env.hasOwnProperty("https_proxy")) {
            proxyServer = process.env.https_proxy;

        }
        else if (process.env.hasOwnProperty("HTTPS_PROXY")) {
            proxyServer = process.env.HTTPS_PROXY;
        }

        if (proxyServer !== null && proxyServer !== "") {
            if (!proxyServer.match(/^http[s]?:\/\//)) {
                proxyServer = `http://${proxyServer}`;
            }
            httpsProxy = url.parse(proxyServer);
        }

        if (httpsProxy !== null) {
            // setup for https proxy

            const proxyOptions = options;

            proxyOptions.path = url.format(options);
            proxyOptions.pathname = proxyOptions.path;
            proxyOptions.headers = options.headers || {};
            proxyOptions.headers.Host = options.host || url.format({
                hostname: options.hostname,
                port: options.port
            });
            proxyOptions.protocol = httpsProxy.protocol;
            proxyOptions.hostname = httpsProxy.hostname;
            proxyOptions.port = httpsProxy.port;
            proxyOptions.href = null;
            proxyOptions.host = null;

            return proxyOptions;
        }
    }

    return options;
};

exports.API = Api;

/* support legacy API */
exports.setup = function(token, app, options) {
    singleton = new Api(token, app, options);
};
exports.get = function(endpoint, data, callback) {
    singleton.get(endpoint, data, callback);
};
exports.post = function(endpoint, data, callback) {
    singleton.post(endpoint, data, callback);
};
exports.put = function(endpoint, data, callback) {
    singleton.put(endpoint, data, callback);
};
exports.delete = function(endpoint, callback) {
    singleton.delete(endpoint, callback);
};

// Copyright 2016 Circonus, Inc. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

//
// NOTE: this module needs to be brought up to date (see nad's)
//       no changes until switching over to promises
//

/* eslint-disable */

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

'use strict';

const qs = require('querystring');
const url = require('url');
const http = require('http');
const https = require('https');
const path = require('path');
const zlib = require('zlib');

const cosi = require(path.resolve(path.join(__dirname, '..')));

let singleton = null;

const Api = function(token, app, options) {
    options = options || 'https://api.circonus.com/v2/';
    if (typeof options === 'string') {
        options = url.parse(options);
    }
    this.authtoken = token;
    this.appname = app;
    this.protocol = options.protocol || 'https:';
    this.apihost = options.host || 'api.circonus.com';
    this.apiport = options.port || 443;
    this.apipath = options.path || '/v2/';
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
    const options = this.get_request_options('GET', endpoint, data);

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
    const options = this.get_request_options('POST', endpoint, data);

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
    const options = this.get_request_options('PUT', endpoint, data);

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
    const options = this.get_request_options('DELETE', endpoint);

    this.do_request(options, callback);
};

/**
 * This is called from the various exported functions to actually perform
 * the request.  Will retry up to 5 times in the event we get a connection
 * reset error.
 */
Api.prototype.do_request = function(options, callback) {
    const self = this;

    if (this.verbose) {
        console.log(`${options.method} REQUEST: ${url.format(options)}`);
    }

    const client = options.protocol === 'https:' ? https : http;

    const req = client.request(options, (res) => {
        const data = [];

        res.on('data', (chunk) => {
            data.push(chunk);
        });

        res.on('end', () => {
            // rate limit or server-side error, try again...
            if (res.statusCode === 429 || res.statusCode === 500) {
                if (options.circapi.retry < options.circapi.retry_backoff.length) {
                    setTimeout(() => {
                        self.do_request(options, callback);
                    }, options.circapi.retry_backoff[options.circapi.retry]);
                    options.circapi.retry += 1;
                } else {
                    callback(res.statusCode, new Error(`Giving up after ${options.circapi.retry} attempts`), null, null);

                    return;
                }
            }

            // success, no content
            if (res.statusCode === 204) {
                callback(res.statusCode, null, null, null);

                return;
            }

            const buffer = Buffer.concat(data);
            const encoding = res.headers['content-encoding'];
            let err_msg = null;
            let body = null;

            if (data.length === 0) {
                err_msg = new Error('No data returned, 0 length body.');
            } else if (encoding === 'gzip') {
                try {
                    body = zlib.gunzipSync(buffer).toString();
                } catch (gzipErr) {
                    err_msg = gzipErr;
                }
            } else if (encoding === 'deflate') {
                try {
                    body = zlib.deflateSync(buffer).toString();
                } catch (deflateErr) {
                    err_msg = deflateErr;
                }
            } else {
                body = buffer.toString();
            }

            if (self.verbose) {
                console.log(`RESPONSE ${res.statusCode} : ${body}`);
            }

            if (err_msg !== null) {
                callback(res.statusCode, err_msg, null, body);

                return;
            }

            // If this isn't a 200 level, extract the message from the body
            if (res.statusCode < 200 || res.statusCode > 299) {
                err_msg = new Error('An API occurred');
                try {
                    err_msg.detail = JSON.parse(body);
                } catch (err) {
                    err_msg.detail = err;
                    err_msg.body = body;
                }
                if (res.statusCode === 400 && body.indexOf('Usage limit') !== -1) {
                    err_msg.message = 'Account at or over metric limit';
                }
                err_msg.code = res.statusCode;
                callback(res.statusCode, err_msg, null, body);

                return;
            }

            let parsed = null;

            if (body !== null && body !== '') {
                try {
                    parsed = JSON.parse(body);
                } catch (parseErr) {
                    err_msg = new Error(`Error parsing body`);
                    err_msg.detail = parseErr;
                    err_msg.body = body;
                }
            }

            callback(res.statusCode, err_msg, parsed, body);
        });
    });

    req.on('error', (err) => {
        if (err.code === 'ECONNRESET' && options.circapi.retry < options.circapi.retry_backoff.length) {
            setTimeout(() => {
                self.do_request(options, callback);
            }, options.circapi.retry_backoff[options.circapi.retry]);
            options.circapi.retry += 1;
        } else {
            err.detail = options;
            callback(null, err, null, null); // eslint-disable-line callback-return
        }
    });

    if (options.method.toUpperCase() === 'POST' || options.method.toUpperCase() === 'PUT') {
        const stringified = JSON.stringify(options.circapi.data);

        req.write(stringified);
        if (self.verbose) {
            console.log(stringified);
        }
    }

    req.end();
};

/**
 * Hands back an options object suitable to use with the HTTPS class
 */
Api.prototype.get_request_options = function(method, endpoint, data) {
    // ensure valid url object with all required variables initialized

    const options = cosi.getProxySettings(url.format(
        {
            protocol : this.protocol,
            host     : this.apihost,
            port     : this.apiport,
            path     : this.apipath
        }
    ));

    if ((/^v[46]/).test(process.version)) {
        // currently 2016-10-27T16:01:42Z, these settings seem to be
        // necessary to prevent http/https requests from intermittently
        // emitting an end event prior to all content being received
        // when communicating with the API. at least until the actual
        // root cause can be determined.

        if (!{}.hasOwnProperty.call(options, 'agent') || options.agent === false) {
            options.agent = this.protocol === 'https:' ? new https.Agent() : new http.Agent();
        }

        options.agent.keepAlive = false;
        options.agent.keepAliveMsecs = 0;
        options.agent.maxSockets = 1;
        options.agent.maxFreeSockets = 1;
        options.agent.maxCachedSessions = 0;
    }

    options.method = method.toUpperCase();
    options.headers = {
        'X-Circonus-Auth-Token' : this.authtoken,
        'X-Circonus-App-Name'   : this.appname,
        'Accept'                : 'application/json',
        'Accept-Encoding'       : 'gzip,deflate'
    };

    options.circapi = {
        retry         : 0,
        retry_backoff : [
            null,       // 0 first attempt
            1 * 1000,   // 1, wait 1 second and try again
            2 * 1000,   // 2, wait 2 seconds and try again
            4 * 1000,   // 3, wait 4 seconds and try again
            8 * 1000,   // 4, wait 8 seconds and try again
            16 * 1000,  // 5, wait 16 seconds and try again
            32 * 1000   // 6, wait 32 seconds and retry again then give up if it fails
        ],
        data: null
    };

    options.circapi.data = data;
    if (data !== null) {
        if (options.method === 'POST' || options.method === 'PUT') {
            options.headers['Content-Length'] = JSON.stringify(data).length;
        }
    }

    if (endpoint.match(/^\//)) {
        endpoint = endpoint.substring(1);
    }

    options.path += endpoint;
    if (options.method === 'GET' && data !== null && Object.keys(data).length !== 0) {
        options.path += `?${qs.stringify(data)}`;
    }

    options.pathname = options.path;

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

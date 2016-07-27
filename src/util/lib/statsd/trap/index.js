// Circonus StatsD backend trap
'use strict';

/* eslint-disable no-magic-numbers */
/* eslint-disable no-underscore-dangle */
/* eslint-disable no-process-env */

const path = require('path');
const url = require('url');
const https = require('https');
const http = require('http');

const ProxyAgent = require('https-proxy-agent');

const cosi = require(path.resolve(path.join(__dirname, '..', '..', 'cosi')));

const api = require(path.resolve(path.join(cosi.lib_dir, 'api')));
const Check = require(path.resolve(path.join(cosi.lib_dir, 'check')));


// fetchBrokerCACert retrieves the correct CA cert to use when sending metrics to the broker
function fetchBrokerCACert(cb) {
    api.get('/pki/ca.crt', null, (code, err, body) => {
        if (code === null) {
            let brokerError = err;

            if (brokerError === null) {
                brokerError = new Error('[ERROR] fetching Circonus Broker CA cert');
            }

            return cb(brokerError);
        }

        if (err !== null) {
            return cb(err);
        }

        if (code < 200 || code > 299) {
            const brokerError = new Error(
                `[ERROR] API returned an error code ${code} fetching Circonus Broker CA cert: ${body}`
            );

            return cb(brokerError);
        }

        return cb(null, body);
    });
}


// fetchCheckBundle contacts the Circonus API and retrieves a check bundle object
// parameters cid (check bundle cid), cb (callback function)
// callback(error, checkBundle)
function fetchCheckBundle(cid, cb) {
    api.get(cid, null, (code, err, body) => { // eslint-disable-line consistent-return
        if (code === null) {
            let checkError = err;

            if (checkError === null) {
                checkError = new Error(`[ERROR] fetching check bundle ${cid}`);
            }

            return cb(checkError);
        }

        if (err !== null) {
            return cb(err);
        }

        if (code < 200 || code >= 300) {
            const checkError = new Error(
                `[ERROR] API returned an error code ${code} fetching check bundle ${cid}: ${body}`
            );

            return cb(checkError);
        }

        return cb(null, body);
    });
}


// getProxySettings checks environment for http[s] proxy settings
// returns proxy url if found, otherwise null.
function getProxySettings(urlProtocol) {
    let proxyServer = null;

    if (urlProtocol === 'http:') {
        if ({}.hasOwnProperty.call(process.env, 'http_proxy')) {
            proxyServer = process.env.http_proxy;
        }
        else if ({}.hasOwnProperty.call(process.env, 'HTTP_PROXY')) {
            proxyServer = process.env.HTTP_PROXY;
        }
    }
    else if (urlProtocol === 'https:') {
        if ({}.hasOwnProperty.call(process.env, 'https_proxy')) {
            proxyServer = process.env.https_proxy;
        }
        else if ({}.hasOwnProperty.call(process.env, 'HTTPS_PROXY')) {
            proxyServer = process.env.HTTPS_PROXY;
        }
    }
    if (proxyServer !== null && proxyServer !== '') {
        if (!proxyServer.match(/^http[s]?:\/\//)) {
            proxyServer = `http://${proxyServer}`;
        }
    }

    return proxyServer;
}


// fetchBroker uses the Circonus API to retrieve a broker object
// parameters cid (broker cid), cb (callback function)
// callback(error, broker)
function fetchBroker(cid, cb) {
    api.get(cid, null, (code, err, body) => { // eslint-disable-line consistent-return
        if (err !== null) {
            let brokerError = err;

            if (brokerError === null) {
                brokerError = new Error(`[ERROR] fetching broker ${cid}`);
            }

            return cb(brokerError);
        }

        if (err !== null) {
            return cb(err);
        }

        if (code < 200 || code >= 300) {
            const brokerError = new Error(
                `[ERROR] API returned an error code ${code} fetching broker ${cid}: ${body}` // eslint-disable-line max-len
            );

            return cb(brokerError);
        }

        return cb(null, body);
    });
}


// inventoryMetrics returns an object with metric names as keys and values of true|false
// indicating if the metric is currently active or disabled.
function inventoryMetrics(metrics) {
    const inventory = {};

    for (let i = 0; i < metrics.length; i++) {
        inventory[metrics[i].name] = metrics[i].status === 'active';
    }

    return inventory;
}


module.exports = class Trap {

    // constructor creates a new Trap instance
    constructor(checkID, forceMetricActivation, debug, logger) {
        if (checkID === null || checkID === '') {
            throw new Error('[ERROR] invalid check id passed to Trap constructor');
        }

        // initialize the circonus api
        api.setup(cosi.api_key, cosi.api_app, cosi.api_url);

        this.id = checkID;
        this.forceMetricActivation = forceMetricActivation;
        this.debug = debug;
        this.logger = logger;
        this.enabled = false;

        this.regFile = path.resolve(path.join(cosi.reg_dir, `registration-check-${this.id}.json`));

        this.check = null;
        this.metrics = null;
        this.brokerCN = null;
        this.brokerCACert = null;
        this.submissionURL = null;
        this.submitOptions = null;
        this.metrics = {};

        this.Stats = {
            last_flush: 0,
            last_exception: 0,
            flush_time: 0,
            flush_length: 0
        };

        return this;
    }


    // initialize will setup the object to be used for submissions
    // cb - callback - called with error object or null
    Initialize(cb) {
        const self = this;

        // yessss, callback hell weeeee!
        this._loadBrokerCACert((certErr) => { // eslint-disable-line consistent-return
            if (certErr !== null) {
                return cb(certErr);
            }

            self._loadCheck((checkErr) => { // eslint-disable-line consistent-return
                if (checkErr !== null) {
                    return cb(checkErr);
                }

                if (self.id === 'system' && self.check.config.type !== 'httptrap') {
                    const noitURL = self.check._reverse_connection_urls[0].
                        replace('mtev_reverse', 'https').
                        replace('check', 'module/httptrap');

                    self.submissionURL = `${noitURL}/${self.check.config['reverse:secret_key']}`;
                }
                else {
                    self.submissionURL = self.check.config.submission_url;
                }

                self._loadBrokerCN((cnErr) => {
                    if (cnErr !== null) {
                        return cb(cnErr);
                    }

                    self.enabled = true;
                    self._setSubmitOptions();
                    self.metrics = inventoryMetrics(self.check.metrics);

                    if (self.debug) {
                        self.logger.log(`Trap ${self.id} initialized`);
                    }

                    return cb(null);
                });
            });
        });
    }


    // Submit sends metrics (PUT) to the Circonus broker identified in the check
    // cb - callback - called with number of mertrics received and error object or null
    Submit(metrics, cb) { // eslint-disable-line consistent-return
        const self = this;

        if (!this.enabled) {
            return cb(new Error(`Circonus trap submitter '${this.id}' is not enabled.`));
        }

        this._enableMetrics(metrics, (enableErr) => { // eslint-disable-line consistent-return
            if (enableErr !== null) {
                return cb(enableErr);
            }

            self._sendMetrics(metrics, (sendErr, numMetrics) => {
                if (sendErr !== null) {
                    return cb(sendErr);
                }

                return cb(null, numMetrics);
            });
        });
    }


    // _activateMetric determines if a metric should be activated for a specific check.
    _activateMetric(metric) {
        // metric does not exist, activate
        if (!{}.hasOwnProperty.call(this.metrics, metric)) {
            return true;
        }

        // metric exists and is not active, return forceMetricActivation setting
        if (!this.metrics[metric]) {
            return this.forceMetricActivation;
        }

        // metric exists and is active, leave it alone
        return false;
    }


    // _enableMetrics update check with any new metrics and submit to circonus
    // before sending the metrics...
    // callback(error, number of new metrics)
    _enableMetrics(metrics, cb) { // eslint-disable-line consistent-return
        const self = this;
        const newMetrics = [];

        for (const metric in metrics) { // eslint-disable-line guard-for-in
            if (this._activateMetric(metric)) {
                // for *this* specific implementation (statsd)
                // only histograms will have value of type array
                // all other metrics are straight numbers
                const isHistogram = Array.isArray(metrics[metric]);

                newMetrics.push({
                    name: metric,
                    status: 'active',
                    type: isHistogram ? 'histogram' : 'numeric', // eslint-disable-line multiline-ternary
                    units: null,
                    tags: []
                });
            }
        }

        if (newMetrics.length === 0) {
            return cb(null, newMetrics.length);
        }

        if (this.debug) {
            this.logger.log(`Updating ${this.id} check with ${newMetrics.length} new metrics`);
        }

        this.check.metrics = this.check.metrics.concat(newMetrics);
        this.check.update((err) => {
            if (err !== null) {
                return cb(err);
            }

            try {
                self.check.save(self.regFile, true);
            }
            catch (saveErr) {
                return cb(saveErr);
            }

            self.metrics = inventoryMetrics(self.check.metrics);

            return cb(null, newMetrics.length);
        });
    }


    // _sendMetrics sends metrics to Circonus
    _sendMetrics(metrics, cb) { // eslint-disable-line consistent-return
        let metricJson = null;

        try {
            metricJson = JSON.stringify(metrics);
        }
        catch (jsonErr) {
            return cb(jsonErr);
        }

        const client = this.submitOptions.protocol === 'https:' ?
            https :
            http;

        const req = client.request(this.submitOptions);
        const timeout = setTimeout(() => {
            req.abort();
        }, 15 * 1000);

        req.setTimeout(15 * 1000);

        req.on('response', (res) => {
            let data = '';

            res.on('data', (chunk) => {
                data += chunk;
            });

            res.on('end', () => {
                clearTimeout(timeout);
                if (res.statusCode < 200 || res.statusCode > 299) {
                    return cb(new Error(`HTTP:${res.statusCode} ${data} ${this.submitOptions.href}`)); // eslint-disable-line max-len, multiline-ternary
                }

                let resData = null;

                try {
                    resData = JSON.parse(data);
                }
                catch (jsonErr) {
                    return cb(jsonErr);
                }

                return cb(null, resData.stats);
            });
        });

        req.once('timeout', () => {
            clearTimeout(timeout);
            req.abort();
        });

        req.once('error', (err) => {
            clearTimeout(timeout);

            return cb(err);
        });

        req.write(metricJson);
        req.end();
    }


    // _getSubmitOptions creates a URL URL object suitable for use with http/https request methods
    // returns url object or null on error, and error or null if no error
    _setSubmitOptions() {
        if (this.submitOptions !== null) {
            return;
        }

        const options = url.parse(this.submissionURL);
        const proxyServer = getProxySettings(options.protocol);

        options.agent = false;

        if (proxyServer !== null) {
            options.agent = new ProxyAgent(proxyServer);
            options.timeout = 15 * 1000;
        }

        options.method = 'PUT';
        options.headers = {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        };

        if (this.brokerCACert !== null) {
            options.ca = [ this.brokerCACert ];
        }

        if (this.brokerCN !== null && this.brokerCN !== '') {
            options.servername = this.brokerCN;
        }

        this.submitOptions = options;
    }


    // _loadCheck reads a check defintion from disk and fetches a fresh copy from the Circonus API
    // parameters checkId (statsd|system), cb (callback function)
    // callback(error)
    _loadCheck(cb) { // eslint-disable-line consistent-return
        const self = this;
        const regFile = this.regFile;
        let check = null;

        if (this.check !== null) {
            return cb(null);
        }

        try {
            check = new Check(regFile);
        }
        catch (err) {
            return cb(err);
        }

        // refresh the check bundle to ensure latest updates from UI
        fetchCheckBundle(check._cid, (err, bundle) => {
            if (err !== null) {
                return cb(err);
            }

            check._init(bundle);
            self.check = check;
            self.metrics = inventoryMetrics(self.check.metrics);

            return cb(null);
        });
    }


    // _loadBrokerCN determines the broker common name to use when authenicating the broker
    // against the CA cert. (for submission urls with an ip address)
    // parameters checkID (statsd|system), cb (callback function)
    // callback(error)
    _loadBrokerCN(cb) { // eslint-disable-line consistent-return
        const self = this;

        if (this.brokerCN !== null) {
            return cb(null);
        }

        const submissionURL = self.submissionURL;

        // set broker cn to "" if the submission url does not contain an IP
        if (submissionURL.match(/^https?:\/\/\d+(\.\d+){3}:\d+/) === null) {
            this.brokerCN = '';

            return cb(null);
        }

        // fetch broker object and pull external host name out of details
        fetchBroker(this.check.brokers[0], (err, broker) => {
            if (err !== null) {
                return cb(err);
            }

            for (let i = 0; i <= broker._details.length; i++) {
                const detail = broker._details[i];

                if (submissionURL.indexOf(detail.ipaddress) !== -1) {
                    self.brokerCN = detail.cn;
                    break;
                }
            }

            if (self.brokerCN === null) {
                 // no broker detail matched check submission URL, submit may not work.
                this.brokerCN = '';
            }

            return cb(null);
        });
    }


    // _loadBrokerCACert uses the Circonus API to retrieve the CA certificate
    // to be used for authenicating the Broker
    // parameters cb (callback function)
    // callback(error) error === null means cert loaded
    _loadBrokerCACert(cb) { // eslint-disable-line consistent-return
        const self = this;

        if (this.brokerCACert !== null) {
            return cb(null);
        }

        fetchBrokerCACert((err, cert) => {
            if (err !== null) {
                return cb(err);
            }

            self.brokerCACert = cert.contents;

            return cb(null);
        });
    }

};

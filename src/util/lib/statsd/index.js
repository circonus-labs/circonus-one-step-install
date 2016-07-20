/* eslint-env node */
/* eslint-disable guard-for-in, no-magic-numbers, no-process-exit */

'use strict';

/*
 * StatsD backend to flush stats to Circonus (http://circonus.com/).
 *
 * To enable this backend:
 *   1. install in backends subdirectory of statsd as 'circonus.js'
 *   2. include in the backends configuration array
 *      e.g. backends: ['./backends/circonus']
 *
 * Options in config.js
 *
 * circonus: {
 *
 *  api_token:     required string
 *  api_app:       required string
 *  api_url:       required string
 *
 *  submission_urls:
 *     check:      required string
 *     host:       required string
 *
 *     submission URLs for the instance/host
 *
 *   globalPrefix:         string
 *                         global prefix to use for sending stats to Circonus
 *                         [default: ""]
 *   prefixCounter:        string
 *                         prefix for counter metrics
 *                         [default: "counters"]
 *   prefixTimer:          string
 *                         prefix for timer metrics
 *                         [default: "timers"]
 *   prefixGauge:          string
 *                         prefix for gauge metrics
 *                         [default: "gauges"]
 *   prefixSet:            string
 *                         prefix for set metrics
 *                         [default: "sets"]
 *   sendTimerDerivatives: bool
 *                         send the standard statsd derivatives for timer metrics
 *                         [default: true]
 *   sendMemoryStats:      bool
 *                         send memory utilization metrics for statsd process
 *                         [default: true]
 *   forceGC:              bool
 *                         force garbage collection (helps node-core https tls object reclaim)
 *                         [default: false] (start with --expose-gc)
 *
 * }
 *
 * This backend respects the global setting of keyNameSanitize
 *
 */

const https = require('https');
const http = require('http');
const url = require('url');
const util = require('util');
const path = require('path');

const cosi = require(path.resolve(path.join(__dirname, '..', '..', 'cosi')));
const api = require(path.resolve(path.join(cosi.lib_dir, 'api')));
const Check = require(path.resolve(path.join(cosi.lib_dir, 'check')));

const BACKEND_NAME = 'circonus';
const BACKEND_VERS = cosi.app_version;
const MAX_REQUEST_TIME = 15; // seconds
const MILLISECOND = 1000;
const HTTP_OK = 200;
const METRIC_DELIM = '`';
const circonusPrefix = BACKEND_NAME;

let instance = null;

// get_histogram_bucket_id transforms a value into its correct
// bucket and returns the bucket id as a string
function get_histogram_bucket_id(origVal) {
    let val = origVal;
    let vString = '';
    let exp = 0;

    if (val === 0) {
        return 'H[0]';
    }
    if (val < 0) {
        vString = '-';
        val *= -1;
    }
    while (val < 10) {
        val *= 10;
        exp -= 1;
    }
    while (val >= 100) {
        val /= 10;
        exp += 1;
    }
    val = Math.floor(val);
    val /= 10;
    exp += 1;

    vString = `H[${vString + val.toString()}e${exp.toString()}]`;

    return vString;
}

// make_histogram takes a list of raw values and returns a list of bucket
// strings parseable by the broker
function make_histogram(values) {
    const temp = {};
    const ret = [];
    let i = null;
    let bkt = null;
    let bucket = null;

    for (i = 0; i < values.length; i++) {
        bucket = get_histogram_bucket_id(values[i]);

        if (!{}.hasOwnProperty.call(temp, bucket)) {
            temp[bucket] = 0;
        }
        temp[bucket] += 1;
    }

    for (bkt in temp) {
        if ({}.hasOwnProperty.call(temp, bkt)) {
            ret.push(`${bkt}=${temp[bkt]}`);
        }
    }

    return ret;
}

class Circonus {
    constructor(startup_time, config, logger) {
        const cfg = config.circonus || {};

        // initialize the circonus api
        api.setup(cosi.cosi_api_key, cosi.cosi_api_app, cosi.cosi_api_url);

        this.logger = logger;
        this.debug = config.debug;

        // verify API by way of requesting broker certificate
        this.circonus_get_ca_cert(url.parse(cfg.cert_url || 'http://login.circonus.com/pki/ca.crt'));

        this.checks = null;

        // initialize checks
        this.inititializeChecks();

        // metric names prefixed with this string will be sent to the system check
        // rather than the statsd check
        this.hostMetricPrefix = 'host.';

        // force metric activation - will always enable metrics. default behavior is to
        // leave metrics that do not have a status of "active" alone and only activate
        // new metrics.
        this.forceMetricActivation = typeof cfg.forceMetricActivation === 'undefined' ?
            false :
            typeof cfg.forceMetricActivation;

        this.sendTimerDerivatives = true;
        this.sendRawTimers = false;
        this.sendMemoryStats = true;
        this.forceGC = false;
        this.circonusStats = {
            flush_length: 0,
            flush_time: 0,
            last_exception: startup_time,
            last_flush: startup_time
        };

        // set up namespaces
        this.globalNamespace = [];
        this.counterNamespace = [];
        this.timerNamespace = [];
        this.gaugesNamespace = [];
        this.setsNamespace = [];
        this.prefixInternalMetrics = typeof config.prefixInternalMetrics === 'undefined' ?
            'statsd' :
            config.prefixInternalMetrics;
        this.globalKeySanitize = typeof config.keyNameSanitize === 'undefined' ?
            false :
            config.keyNameSanitize;
        this.flush_counts = typeof config.flush_counts === 'undefined' ?
            true :
            config.flush_counts;

        let globalPrefix = null;
        let prefixCounter = null;
        let prefixTimer = null;
        let prefixGauge = null;
        let prefixSet = null;

        globalPrefix = cfg.globalPrefix || '';
        prefixCounter = 'counters';
        prefixTimer = 'timers';
        prefixGauge = 'gauges';
        prefixSet = 'sets';


        // circonus backend debug can be toggled independently of main debug
        if ({}.hasOwnProperty.call(cfg, 'debug')) {
            this.debug = cfg.debug;
        }

        if ({}.hasOwnProperty.call(cfg, 'sendTimerDerivatives')) {
            this.sendTimerDerivatives = cfg.sendTimerDerivatives;
        }

        if ({}.hasOwnProperty.call(cfg, 'sendRawTimers')) {
            this.sendRawTimers = cfg.sendRawTimers;
        }

        if ({}.hasOwnProperty.call(cfg, 'sendMemoryStats')) {
            this.sendMemoryStats = cfg.sendMemoryStats;
        }

        if ({}.hasOwnProperty.call(cfg, 'forceGC')) {
            this.forceGC = cfg.forceGC;
        }

        if ({}.hasOwnProperty.call(cfg, 'prefixCounter')) {
            prefixCounter = cfg.prefixCounter;
        }

        if ({}.hasOwnProperty.call(cfg, 'prefixTimer')) {
            prefixTimer = cfg.prefixTimer;
        }

        if ({}.hasOwnProperty.call(cfg, 'prefixGauge')) {
            prefixGauge = cfg.prefixGauge;
        }

        if ({}.hasOwnProperty.call(cfg, 'prefixSet')) {
            prefixSet = cfg.prefixSet;
        }

        if (globalPrefix !== '') {
            this.globalNamespace.push(globalPrefix);
            this.counterNamespace.push(globalPrefix);
            this.timerNamespace.push(globalPrefix);
            this.gaugesNamespace.push(globalPrefix);
            this.setsNamespace.push(globalPrefix);
        }

        if (prefixCounter !== '') {
            this.counterNamespace.push(prefixCounter);
        }
        if (prefixTimer !== '') {
            this.timerNamespace.push(prefixTimer);
        }
        if (prefixGauge !== '') {
            this.gaugesNamespace.push(prefixGauge);
        }
        if (prefixSet !== '') {
            this.setsNamespace.push(prefixSet);
        }

        if (this.debug) {
            this.logger.log(util.format('Backend %s v%s loaded.', BACKEND_NAME, BACKEND_VERS));
        }

        return this;
    }

    inititializeChecks() {

        this.checks = {
            statsd: {
                cfgFile: path.resolve(path.join(cosi.reg_dir, 'registration-statsd.json')),
                check: null,
                enabled: false,
                metrics: null
            },
            system: {
                cfgFile: path.resolve(path.join(cosi.reg_dir, 'registration-system.json')),
                check: null,
                enabled: false,
                metrics: null
            }
        };

        try {
            this.checks.statsd.check = new Check(this.checks.statsd.cfgFile);
            this.checks.statsd.enabled = true;
            this.refreshCheck('statsd');
        }
        catch (err) {
            if (err.code === 'MODULE_NOT_FOUND') {
                this.logger.log('[ERROR] initializing statsd check', err);
                process.exit(1);
            }
        }

        try {
            this.checks.system.check = new Check(this.checks.system.cfgFile);
            this.checks.system.enabled = true;
            this.refreshCheck('system');
        }
        catch (err) {
            if (err.code === 'MODULE_NOT_FOUND') {
                this.logger.log('[ERROR] initializing system check', err);
                process.exit(1);
            }
        }
    }

    circonus_get_ca_cert(cert_url) {
        const self = this;
        let client = null;
        let cert_obj = null;
        let reqTimerId = null;
        let req = null;

        function onReqError(err) {
            if (reqTimerId) {
                clearTimeout(reqTimerId);
            }

            if (self.debug) {
                self.logger.log(util.format('Cert request error: %j', err));
            }

            req = null;
        }

        function onReqTimeout() {
            if (reqTimerId) {
                clearTimeout(reqTimerId);
            }

            req.abort();

            if (self.debug) {
                self.logger.log('Circonus timeout fetching CA cert');
            }

            req = null;
        }

        function onReqResponse(res) {
            let cert_data = '';

            res.on('data', (data) => {
                cert_data += data;
            });

            res.on('end', () => {
                const circonus_url = url.parse(self.check_url);

                if (reqTimerId) {
                    clearTimeout(reqTimerId);
                }

                if (res.statusCode !== HTTP_OK) {
                    throw new Error(util.format('Unable to retrieve Circonus Broker CA Cert %d', res.statusCode));
                }

                self.check_cfg = {
                    hostname: circonus_url.host,
                    path: circonus_url.path,
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'application/json'
                    },
                    ca: [ cert_data ]
                };

                if (self.debug) {
                    self.logger.log(util.format('Loaded Circonus broker CA cert from %s', cert_url.href));
                }

                req = null;
            });
        }

        if (cert_url && this.check_url) {
            cert_obj = url.parse(cert_url);

            if (cert_obj.protocol === 'https:') {
                client = https;
            }
            else {
                client = http;
            }

            reqTimerId = setTimeout(onReqTimeout, MAX_REQUEST_TIME * MILLISECOND);
            req = client.request(cert_url);
            req.on('error', onReqError);
            req.on('response', onReqResponse);
            req.end();
        }
        else {
            this.logger.log('Missing cert url, circonus backend disabled.');
        }
    }

    circonus_post_stats(metrics) {
        const self = this;
        const last_flush = this.circonusStats.last_flush || 0;
        const last_exception = this.circonusStats.last_exception || 0;
        const flush_time = this.circonusStats.flush_time || 0;
        const flush_length = this.circonusStats.flush_length || 0;
        let metric_json = '';
        const starttime = Date.now();
        const namespace = this.globalNamespace.concat(this.prefixInternalMetrics);
        let req = null;
        let reqTimerId = null;

        if (this.debug) {
            this.logger.log('post');
        }

        function onReqError(err) {
            if (reqTimerId) {
                clearTimeout(reqTimerId);
            }
            if (self.debug) {
                self.logger.log(util.format('Error sending to circonus: %j', err));
            }
            req = null;
        }

        function onReqTimeout() {
            if (reqTimerId) {
                clearTimeout(reqTimerId);
            }
            req.abort();
            if (self.debug) {
                self.logger.log('Timeout sending metrics to Circonus');
            }
            req = null;
        }

        function onReqResponse(res) {
            let result_json = '';

            res.on('data', (chunk) => {
                result_json += chunk;
            });

            res.on('end', () => {
                let result = null;

                if (reqTimerId) {
                    clearTimeout(reqTimerId);
                }

                if (self.debug) {
                    result = JSON.parse(result_json);
                    self.logger.log(util.format('%d metrics recieved by circonus', result.stats));
                }

                if (res.statusCode === HTTP_OK) {
                    self.circonusStats.flush_time = Date.now() - starttime;
                    self.circonusStats.flush_length = metric_json.length;
                    self.circonusStats.last_flush = Math.round(new Date().getTime() / MILLISECOND);
                }
                else {
                    self.logger.log(util.format('Unable to send metrics to Circonus http:%d (%s)', res.statusCode, result_json));
                }

                req = null;
                metric_json = null;

                if (self.forceGC && global.gc) {
                    global.gc();
                }
            });
        }

        if (self.check_cfg) {
            try {
                const newMetrics = metrics;

                newMetrics[namespace.concat([ self.circonusPrefix, 'last_exception' ]).join(METRIC_DELIM)] = last_exception;
                newMetrics[namespace.concat([ self.circonusPrefix, 'last_flush' ]).join(METRIC_DELIM)] = last_flush;
                newMetrics[namespace.concat([ self.circonusPrefix, 'flush_time' ]).join(METRIC_DELIM)] = flush_time;
                newMetrics[namespace.concat([ self.circonusPrefix, 'flush_length' ]).join(METRIC_DELIM)] = flush_length;
                newMetrics[namespace.concat('num_stats').join(METRIC_DELIM)] = Object.keys(metrics).length + 1; // +1 for this one...

                metric_json = JSON.stringify(newMetrics);
                if (self.debug) {
                    self.logger.log(util.format('Metrics: %j', newMetrics));
                }

                reqTimerId = setTimeout(onReqTimeout, MAX_REQUEST_TIME * MILLISECOND);
                req = https.request(self.check_cfg);
                req.on('error', onReqError);
                req.on('response', onReqResponse);
                req.write(metric_json);
                req.end();
            }
            catch (err) {
                if (self.debug) {
                    self.logger.log(util.format('Post error: %j', err));
                }
                self.circonusStats.last_exception = Math.round(new Date().getTime() / MILLISECOND);
            }
        }
    }


    circonus_flush_stats(ts, metrics) {
        const starttime = new Date(ts * MILLISECOND);
        let key = null;
        let timer_data_key = null;
        const counters = metrics.counters;
        const gauges = metrics.gauges;
        const timers = metrics.timers;
        const sets = metrics.sets;
        const counter_rates = metrics.counter_rates;
        const timer_data = metrics.timer_data;
        const statsd_metrics = metrics.statsd_metrics;
        let sk = null;
        let namespace = null;
        let the_key = null;
        const stats = {};
        let value = null;
        let valuePerSecond = null;
        let timer_data_sub_key = null;
        const self = this;

        if (this.debug) {
            this.logger.log('flush');
        }

        // Sanitize key if not done globally
        sk = function sanitize_key(key_name) {
            if (self.globalKeySanitize) {
                return key_name;
            }

            return key_name.
                replace(/\s+/g, '_').
                replace(/\//g, '-').
                replace(/[^a-zA-Z_\-0-9\.`]/g, '');
        };


        if (this.debug) {
            this.logger.log('flush.counters');
        }
        for (key in counters) {
            value = counters[key];
            valuePerSecond = counter_rates[key]; // pre-calculated "per second" rate

            the_key = sk(key);
            namespace = this.counterNamespace.concat(the_key);
            stats[namespace.concat('rate').join(METRIC_DELIM)] = valuePerSecond;
            if (this.flush_counts) {
                stats[namespace.concat('count').join(METRIC_DELIM)] = value;
            }
        }


        if (this.debug) {
            this.logger.log('flush.timers');
        }
        for (key in timers) {
            namespace = this.timerNamespace.concat(sk(key));
            the_key = namespace.join(METRIC_DELIM);
            if (this.sendRawTimers) {
                stats[the_key] = {
                    _type: 'i',
                    _value: timers[key]
                };
            }
            else {
                stats[the_key] = {
                    _type: 'n',
                    _value: make_histogram(timers[key])
                };
            }
        }

        if (this.sendTimerDerivatives) {
            if (this.debug) {
                this.logger.log('flush.timerDerivatives');
            }

            // the derivative metrics from timers
            for (key in timer_data) {
                namespace = this.timerNamespace.concat(sk(key));
                the_key = namespace.join(METRIC_DELIM);
                for (timer_data_key in timer_data[key]) {
                    if (typeof timer_data[key][timer_data_key] === 'number') {
                        stats[the_key + METRIC_DELIM + timer_data_key] = timer_data[key][timer_data_key];
                    }
                    else {
                        for (timer_data_sub_key in timer_data[key][timer_data_key]) {
                            stats[the_key + METRIC_DELIM + timer_data_key + METRIC_DELIM + timer_data_sub_key] =
                                timer_data[key][timer_data_key][timer_data_sub_key];
                        }
                    }
                }
            }
        }

        if (this.debug) {
            this.logger.log('flush.gauges');
        }
        for (key in gauges) {
            stats[this.gaugesNamespace.concat(sk(key)).join(METRIC_DELIM)] = gauges[key];
        }

        if (this.debug) {
            this.logger.log('flush.sets');
        }
        for (key in sets) {
            stats[this.setsNamespace.concat([ sk(key), 'count' ]).join(METRIC_DELIM)] = sets[key].size();
        }

        if (this.debug) {
            this.logger.log('flush.internal');
        }
        namespace = this.globalNamespace.concat(this.prefixInternalMetrics);
        stats[namespace.concat([ circonusPrefix, 'calculation_time' ]).join(METRIC_DELIM)] = Date.now() - starttime;
        for (key in statsd_metrics) {
            stats[namespace.concat(key).join(METRIC_DELIM)] = statsd_metrics[key];
        }

        if (this.sendMemoryStats) {
            stats[namespace.concat('memory').join(METRIC_DELIM)] = process.memoryUsage();
        }

        if (this.debug) {
            this.logger.log('flush.call_post');
        }
        this.circonus_post_stats(stats);
    }

    circonus_backend_status(writeCb) {
        let stat = null;

        for (stat in this.circonusStats) {
            if ({}.hasOwnProperty.call(this.circonusStats, stat)) {
                writeCb(null, BACKEND_NAME, stat, this.circonusStats[stat]);
            }
        }
    }
}

/*
read registrations and refresh check configs (untraced changes)
inventory metrics (in each)
on flush, activate new metrics
then flush stats
*/

exports.init = function circonus_init(startup_time, config, events, logger) {
    if (instance === null) {
        instance = new Circonus(startup_time, config, logger);

        events.on('flush', instance.circonus_flush_stats);
        events.on('status', instance.circonus_backend_status);
    }

    return true;
};

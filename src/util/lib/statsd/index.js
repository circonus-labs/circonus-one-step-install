/* eslint-env node */
/* eslint-disable guard-for-in */
/* eslint-disable no-magic-numbers */
/* eslint-disable new-cap */

/* eslint-disable max-len */

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

const path = require('path');

const cosi = require(path.resolve(path.join(__dirname, '..', 'cosi')));
const Trap = require(path.resolve(path.join(__dirname, 'trap')));

const BACKEND_NAME = 'circonus';
const BACKEND_VERS = cosi.app_version;
const MILLISECOND = 1000;
const METRIC_DELIM = '`';

let instance = null;

// getHistogramBucketID transforms a value into its correct
// bucket and returns the bucket id as a string
function getHistogramBucketID(origVal) {
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

// makeHistogram takes a list of raw values and returns a list of bucket
// strings parseable by the broker
function makeHistogram(values) {
    const temp = {};
    const ret = [];
    let i = null;
    let bkt = null;
    let bucket = null;

    for (i = 0; i < values.length; i++) {
        bucket = getHistogramBucketID(values[i]);

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


// Circonus is the backend class
class Circonus {

    // constructor builds a new Circonus backend instance
    constructor(startup_time, config, events, logger) {
        const cfg = config.circonus || {};


        this.logger = logger;
        this.eventManager = events;

        // global debugging setting
        this.debug = config.debug;

        // circonus backend debug can be toggled independently of main debug
        if ({}.hasOwnProperty.call(cfg, 'debug')) {
            this.debug = cfg.debug;
        }

        this.checks = {
            statsd: null,
            system: null
        };

        // initialize checks
        this._initializeChecks();

        // metric names prefixed with this string will be sent to the system check
        // rather than the statsd check
        this.hostMetricPrefix = 'host.';

        // force metric activation - will always enable metrics. default behavior is to
        // leave metrics that do not have a status of "active" alone and only activate
        // new metrics.
        this.forceMetricActivation = typeof cfg.forceMetricActivation === 'undefined' ?
            false :
            cfg.forceMetricActivation;

        this.sendTimerDerivatives = true;
        this.sendRawTimers = false;
        this.sendMemoryStats = true;
        this.forceGC = false;
        this.circonusStats = {
            statsd: {
                flush_length: 0,
                flush_time: 0,
                last_exception: startup_time,
                last_flush: startup_time
            },
            system: {
                flush_length: 0,
                flush_time: 0,
                last_exception: startup_time,
                last_flush: startup_time
            }
        };
        this.circonusPrefix = BACKEND_NAME;

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

        this.setNamespaces(cfg);

        return this;
    }

    // setNamespaces configures backend namespaces for each metric type
    // parameter cfg (circonus portion of global configuration)
    setNamespaces(cfg) {
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
    }


    // _initializeChecks sets up the check instances in the Circonus class
    _initializeChecks() {
        const self = this;

        this.checks.statsd = new Trap('statsd', this.forceMetricActivation, this.debug, this.logger);
        this.checks.statsd.Initialize((statsdErr) => {
            if (statsdErr !== null) {
                self.logger.log('[ERROR] Unable to load statsd check', statsdErr);
                self.logger.log(`${BACKEND_NAME} backend disabled.`);

                return;
            }

            self.checks.system = new Trap('system', this.forceMetricActivation, this.debug, this.logger);
            self.checks.system.Initialize((systemErr) => {
                if (systemErr !== null) {
                    console.dir(systemErr);
                    self.logger.log('[ERROR] Unable to load system check', systemErr);
                    self.logger.log(`${BACKEND_NAME} backend disabled.`);

                    return;
                }

                // enable events
                self.eventManager.on('flush', instance.flushMetrics);
                self.eventManager.on('status', instance.backendStats);
                if (self.debug) {
                    self.logger.log(`Backend ${BACKEND_NAME} v${BACKEND_VERS} loaded.`);
                }

            });
        });
    }


    // sanitizeKey cleans up a metric name if not already done globally
    sanitizeKey(key_name) {
        if (this.globalKeySanitize) {
            return key_name;
        }

        return key_name.
            replace(/\s+/g, '_').
            replace(/\//g, '-').
            replace(/[^a-zA-Z_\-0-9\.`]/g, '');
    }


    // submitMetrics sends metrics to circonus
    submitMetrics(statsdMetrics, systemMetrics) {
        const startTime = Date.now();
        const namespace = this.globalNamespace.concat(this.prefixInternalMetrics);
        const self = this;

        const statsdLastFlush = this.circonusStats.statsd.lastFlush || 0;
        const statsdLastException = this.circonusStats.statsd.lastException || 0;
        const statsdFlushTime = this.circonusStats.statsd.flushTime || 0;
        const statsdFlushLength = this.circonusStats.statsd.flushLength || 0;

        const systemLastFlush = this.circonusStats.system.lastFlush || 0;
        const systemLastException = this.circonusStats.system.lastException || 0;
        const systemFlushTime = this.circonusStats.system.flushTime || 0;
        const systemFlushLength = this.circonusStats.system.flushLength || 0;

        statsdMetrics[namespace.concat([ this.circonusPrefix, 'last_flush' ]).join(METRIC_DELIM)] = statsdLastFlush; // eslint-disable-line no-param-reassign
        statsdMetrics[namespace.concat([ this.circonusPrefix, 'last_exception' ]).join(METRIC_DELIM)] = statsdLastException; // eslint-disable-line no-param-reassign
        statsdMetrics[namespace.concat([ this.circonusPrefix, 'flush_time' ]).join(METRIC_DELIM)] = statsdFlushTime; // eslint-disable-line no-param-reassign
        statsdMetrics[namespace.concat([ this.circonusPrefix, 'flush_length' ]).join(METRIC_DELIM)] = statsdFlushLength; // eslint-disable-line no-param-reassign
        statsdMetrics[namespace.concat('num_stats').join(METRIC_DELIM)] = Object.keys(statsdMetrics).length + 1; // eslint-disable-line no-param-reassign

        systemMetrics[namespace.concat([ this.circonusPrefix, 'last_flush' ]).join(METRIC_DELIM)] = systemLastFlush; // eslint-disable-line no-param-reassign
        systemMetrics[namespace.concat([ this.circonusPrefix, 'last_exception' ]).join(METRIC_DELIM)] = systemLastException; // eslint-disable-line no-param-reassign
        systemMetrics[namespace.concat([ this.circonusPrefix, 'flush_time' ]).join(METRIC_DELIM)] = systemFlushTime; // eslint-disable-line no-param-reassign
        systemMetrics[namespace.concat([ this.circonusPrefix, 'flush_length' ]).join(METRIC_DELIM)] = systemFlushLength; // eslint-disable-line no-param-reassign
        systemMetrics[namespace.concat('num_stats').join(METRIC_DELIM)] = Object.keys(systemMetrics).length + 1; // eslint-disable-line no-param-reassign

        if (this.debug) {
            this.logger.log('Calling statsd check submitter');
        }
        this.checks.statsd.Submit(statsdMetrics, (err, stats) => {
            if (err !== null) {
                self.circonusStats.statsd.lastException = Math.round(new Date().getTime() / MILLISECOND);
                if (self.debug) {
                    self.logger.log(err);
                }

                return;
            }

            if (self.debug) {
                self.logger.log(`${stats} submitted to statsd check`);
            }

            const metrics = JSON.stringify(statsdMetrics);

            self.circonusStats.statsd.flushTime = Date.now() - startTime;
            self.circonusStats.statsd.flushLength = metrics.length;
            self.circonusStats.statsd.lastFlush = Math.round(new Date().getTime() / MILLISECOND);
        });

        if (this.debug) {
            this.logger.log('Calling system check submitter');
        }
        this.checks.system.Submit(systemMetrics, (err, stats) => {
            if (err !== null) {
                self.circonusStats.system.lastException = Math.round(new Date().getTime() / MILLISECOND);
                self.logger.log(err);

                return;
            }

            if (self.debug) {
                self.logger.log(`${stats} submitted to system check`);
            }

            const metrics = JSON.stringify(systemMetrics);

            self.circonusStats.system.flushTime = Date.now() - startTime;
            self.circonusStats.system.flushLength = metrics.length;
            self.circonusStats.system.lastFlush = Math.round(new Date().getTime() / MILLISECOND);
        });
    }


    // flushMetrics resopnds to the 'flush' event to aggregate metrics
    // start a submission to circonus
    flushMetrics(ts, metrics) { // eslint-disable-line complexity
        const starttime = new Date(ts * MILLISECOND);
        const counters = metrics.counters;
        const gauges = metrics.gauges;
        const timers = metrics.timers;
        const sets = metrics.sets;
        const counter_rates = metrics.counter_rates;
        const timer_data = metrics.timer_data;
        const statsd_stats = metrics.statsd_metrics;
        const statsd_metrics = {};
        const system_metrics = {};

        if (instance.forceGC && global.gc) {
            global.gc();
        }

        if (instance.debug) {
            instance.logger.log('flush.counters');
        }
        for (const key in counters) {
            let stats = null;
            let isSystemMetric = false;
            let the_key = instance.sanitizeKey(key);

            if (the_key.substr(0, 5) === 'host.') {
                the_key = the_key.substr(5);
                isSystemMetric = true;
            }

            if (isSystemMetric) {
                stats = system_metrics;
            }
            else {
                stats = statsd_metrics;
            }

            const namespace = instance.counterNamespace.concat(the_key);
            const value = counters[key];
            const valuePerSecond = counter_rates[key]; // pre-calculated "per second" rate

            stats[namespace.concat('rate').join(METRIC_DELIM)] = valuePerSecond;
            if (instance.flush_counts) {
                stats[namespace.concat('count').join(METRIC_DELIM)] = value;
            }
        }

        if (instance.debug) {
            instance.logger.log('flush.timers');
        }
        for (const key in timers) {
            let stats = null;
            let isSystemMetric = false;
            let the_key = instance.sanitizeKey(key);

            if (the_key.substr(0, 5) === 'host.') {
                the_key = the_key.substr(5);
                isSystemMetric = true;
            }

            if (isSystemMetric) {
                stats = system_metrics;
            }
            else {
                stats = statsd_metrics;
            }

            const namespace = instance.timerNamespace.concat(the_key);
            const metricName = namespace.join(METRIC_DELIM);

            if (instance.sendRawTimers) {
                stats[metricName] = {
                    _type: 'i',
                    _value: timers[key]
                };
            }
            else {
                stats[metricName] = makeHistogram(timers[key]);

                // stats[metricName] = {
                //     _type: 'n',
                //     _value: makeHistogram(timers[key])
                // };
            }
        }

        if (instance.sendTimerDerivatives) {
            if (instance.debug) {
                instance.logger.log('flush.timerDerivatives');
            }

            // the derivative metrics from timers
            for (const key in timer_data) {
                let stats = null;
                let isSystemMetric = false;
                let the_key = instance.sanitizeKey(key);

                if (the_key.substr(0, 5) === 'host.') {
                    the_key = the_key.substr(5);
                    isSystemMetric = true;
                }

                if (isSystemMetric) {
                    stats = system_metrics;
                }
                else {
                    stats = statsd_metrics;
                }

                const namespace = instance.timerNamespace.concat(the_key);
                const metricName = namespace.join(METRIC_DELIM);

                for (const timer_data_key in timer_data[key]) {
                    if (typeof timer_data[key][timer_data_key] === 'number') {
                        stats[metricName + METRIC_DELIM + timer_data_key] = timer_data[key][timer_data_key];
                    }
                    else {
                        for (const timer_data_sub_key in timer_data[key][timer_data_key]) {
                            stats[metricName + METRIC_DELIM + timer_data_key + METRIC_DELIM + timer_data_sub_key] =
                                timer_data[key][timer_data_key][timer_data_sub_key];
                        }
                    }
                }
            }
        }

        if (instance.debug) {
            instance.logger.log('flush.gauges');
        }
        for (const key in gauges) {
            let stats = null;
            let isSystemMetric = false;
            let the_key = instance.sanitizeKey(key);

            if (the_key.substr(0, 5) === 'host.') {
                the_key = the_key.substr(5);
                isSystemMetric = true;
            }

            if (isSystemMetric) {
                stats = system_metrics;
            }
            else {
                stats = statsd_metrics;
            }

            const namespace = instance.gaugesNamespace.concat(the_key);
            const metricName = namespace.join(METRIC_DELIM);

            stats[metricName] = gauges[key];
        }

        if (instance.debug) {
            instance.logger.log('flush.sets');
        }
        for (const key in sets) {
            let stats = null;
            let isSystemMetric = false;
            let the_key = instance.sanitizeKey(key);

            if (the_key.substr(0, 5) === 'host.') {
                the_key = the_key.substr(5);
                isSystemMetric = true;
            }

            if (isSystemMetric) {
                stats = system_metrics;
            }
            else {
                stats = statsd_metrics;
            }

            const namespace = instance.setsNamespace.concat(the_key);
            const metricName = namespace.join(METRIC_DELIM);

            stats[metricName] = sets[key].size();
        }

        if (instance.debug) {
            instance.logger.log('flush.internal');
        }

        const internalNamespace = instance.globalNamespace.concat(instance.prefixInternalMetrics);

        statsd_metrics[
            internalNamespace.concat([
                instance.circonusPrefix,
                'calculation_time' ]).join(METRIC_DELIM)
            ] = Date.now() - starttime;

        for (const key in statsd_stats) {
            const metricName = internalNamespace.concat(key).join(METRIC_DELIM);

            statsd_metrics[metricName] = statsd_stats[key];
        }

        if (instance.sendMemoryStats) {
            const mem = process.memoryUsage();

            for (const key in mem) {
                const metricName = internalNamespace.concat('memory', key).join(METRIC_DELIM);

                statsd_metrics[metricName] = mem[key];
            }
        }

        instance.submitMetrics(statsd_metrics, system_metrics);
    }


    // backendStats exposes stats specific to thie backend in response to the 'status' event
    backendStats(writeCb) {
        for (const check in instance.circonusStats) {
            const stats = instance.circonusStats[check];

            for (const stat in stats) {
                writeCb(null, BACKEND_NAME, `${check}_${stat}`, stats[stat]);
            }
        }
    }
}

// circonus_init is the exported function to initialize the circonus backend
function circonus_init(startup_time, config, events, logger) {
    if (instance === null) {
        instance = new Circonus(startup_time, config, events, logger);
    }

    return true;
}

module.exports.init = circonus_init;

// END

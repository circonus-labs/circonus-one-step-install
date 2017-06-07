// Copyright 2016 Circonus, Inc. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const url = require('url');

const chalk = require('chalk');

const cosi = require(path.resolve(path.join(__dirname, '..')));

let instance = null;

let metrics = {};
let groups = [];

class Metrics {

    /**
     * create new metrics object
     * @arg {String} agentUrl URL for NAD/agent
     */
    constructor(agentUrl) {
        if (instance !== null) {
            return instance;
        }
        assert.strictEqual(typeof agentUrl, 'string', 'agentUrl is required');

        this.url = url.parse(agentUrl);
        if (this.url.protocol === 'https:') {
            this.client = require('https'); // eslint-disable-line global-require
        } else {
            this.client = require('http'); // eslint-disable-line global-require
        }
        metrics = {};
        groups = [];

        instance = this; // eslint-disable-line consistent-this

        return instance;
    }

    /**
     * load metrics from the agent
     * @arg {Function} cb callback
     * @returns {Undefined} nothing, uses callback
     */
    load(cb) {
        assert.strictEqual(typeof cb, 'function', 'cb must be a callback function');
        const self = this;

        if (groups.length > 0) {
            cb(null, true);

            return;
        }

        instance.client.get(instance.url, (res) => {
            let data = '';

            res.on('data', (chunk) => {
                data += chunk;
            });

            res.on('end', () => {
                if (res.statusCode !== 200) {
                    cb(new Error(`${res.statusCode} ${res.statusMessage} ${data}`));

                    return;
                }

                try {
                    // try to save a copy of the RAW output from NAD for debugging (if needed)
                    const rawMetricsFile = path.resolve(path.join(cosi.reg_dir, `raw-metrics-${Date.now()}.json`));

                    fs.writeFileSync(rawMetricsFile, data, {
                        encoding : 'utf8',
                        flag     : 'w',
                        mode     : 0o644
                    });
                } catch (ignoreError) {
                    // ignore
                }

                try {
                    metrics = self._parseMetrics(JSON.parse(data));
                    groups = Object.keys(metrics);
                } catch (err) {
                    cb(err);

                    return;
                }

                cb(null, true);
            });
        }).on('error', (err) => {
            if (err.code === 'ECONNREFUSED') {
                console.error(chalk.red('Fetch metrics - unable to connect to NAD'), url.format(this.url), err.toString());
                process.exit(1); // eslint-disable-line no-process-exit
            }

            cb(err);
        });
    }

    /**
     * return metric groups
     * @arg {Function} cb callback
     * @returns {Undefined} nothing, uses callback
     */
    getGroups(cb) { // eslint-disable-line class-methods-use-this
        assert.strictEqual(typeof cb, 'function', 'cb must be a callback function');

        instance.load((err) => {
            if (err) {
                cb(err);

                return;
            }

            cb(null, groups);
        });
    }

    /**
     * return metrics
     * @arg {Function} cb callback
     * @returns {Undefined} nothing, uses callback
     */
    getMetrics(cb) { // eslint-disable-line class-methods-use-this
        assert.strictEqual(typeof cb, 'function', 'cb must be a callback function');

        instance.load((err) => {
            if (err) {
                cb(err);

                return;
            }

            cb(null, metrics);
        });
    }

    /**
     * return metrics for specific group
     * @arg {String} group metric group
     * @arg {Function} cb callback
     * @returns {Undefined} nothing, uses callback
     */
    getGroupMetrics(group, cb) { // eslint-disable-line class-methods-use-this
        assert.strictEqual(typeof group, 'string', 'group is required');
        assert.strictEqual(typeof cb, 'function', 'cb must be a callback function');

        instance.load((err) => {
            if (err) {
                cb(err);

                return;
            }

            if (!{}.hasOwnProperty.call(metrics, group)) {
                cb(new Error(`Unknown metric group '${group}'`));

                return;
            }

            cb(null, metrics[group]);
        });
    }

    /**
     * return count of metrics for each metric group
     * @arg {Function} cb callback
     * @returns {Undefined} nothing, uses callback
     */
    getMetricStats(cb) { // eslint-disable-line class-methods-use-this
        assert.strictEqual(typeof cb, 'function', 'cb must be a callback function');

        instance.load((err) => {
            if (err) {
                cb(err);

                return;
            }

            const stats = {};

            for (let i = 0; i < groups.length; i++) {
                stats[groups[i]] = Object.keys(metrics[groups[i]]).length;
            }

            cb(null, stats);
        });
    }

    /**
     * _parseMetrics and _getMetrics are used to flatten out all metrics (e.g. json blobs emitted from plugins)
     * @arg {Object} rawMetrics from agent
     * @returns {Object} flattened metric list
     */
    _parseMetrics(rawMetrics) {
        const metricList = {};

        for (const group in rawMetrics) { // eslint-disable-line guard-for-in
            metricList[group] = this._getMetrics(null, rawMetrics[group]);
        }

        return metricList;
    }

    /**
     * _parseMetrics and _getMetrics are used to flatten out all metrics (e.g. json blobs emitted from plugins)
     * @arg {String} prefix from parent metric
     * @arg {Object} rawMetrics from agent
     * @returns {Object} flattened metric list
     */
    _getMetrics(prefix, rawMetrics) {
        let metricList = {};

        for (const metric in rawMetrics) { // eslint-disable-line guard-for-in
            const metricName = prefix === null ? metric : `${prefix}\`${metric}`;

            if (rawMetrics[metric] === null) {
                metricList[metricName] = rawMetrics[metric];
            } else if (typeof rawMetrics[metric] === 'string') {
                metricList[metricName] = rawMetrics[metric];
            } else if (typeof rawMetrics[metric] === 'number') {
                metricList[metricName] = rawMetrics[metric];
            } else if (typeof rawMetrics[metric] === 'boolean') {
                metricList[metricName] = rawMetrics[metric];
            } else if (Array.isArray(rawMetrics[metric])) {
                metricList[metricName] = rawMetrics[metric];
            } else if (typeof rawMetrics[metric] === 'object' && {}.hasOwnProperty.call(rawMetrics[metric], '_value')) {
                metricList[metricName] = rawMetrics[metric];
            } else {
                metricList = Object.assign(metricList, this._getMetrics(metricName, rawMetrics[metric]));
            }
        }

        return metricList;
    }

}

module.exports = Metrics;

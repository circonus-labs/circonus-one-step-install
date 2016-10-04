'use strict';

/* eslint-env node, es6 */
/* eslint-disable no-magic-numbers, consistent-return */

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

    load(cb) {
        assert.strictEqual(typeof cb, 'function', 'cb must be a callback function');
        const self = this;

        if (groups.length > 0) {
            return cb(null, true);
        }

        instance.client.get(instance.url, (res) => {
            let data = '';

            res.on('data', (chunk) => {
                data += chunk;
            });

            res.on('end', () => {
                if (res.statusCode !== 200) {
                    return cb(new Error(`${res.statusCode} ${res.statusMessage} ${data}`));
                }

                try {
                    // try to save a copy of the RAW output from NAD for debugging (if needed)
                    const rawMetricsFile = path.resolve(path.join(cosi.reg_dir, `raw-metrics-${Date.now()}.json`));

                    fs.writeFileSync(rawMetricsFile, data, { encoding: 'utf8', mode: 0o644, flag: 'w' });
                } catch (err) {
                    // ignore
                }

                try {
                    metrics = self._parseMetrics(JSON.parse(data));
                    groups = Object.keys(metrics);
                } catch (err) {
                    return cb(err);
                }

                return cb(null, true);
            });
        }).on('error', (err) => {
            if (err.code === 'ECONNREFUSED') {
                console.error(chalk.red('Fetch metrics - unable to connect to NAD'), url.format(this.url), err.toString());
                process.exit(1); // eslint-disable-line no-process-exit
            }
            return cb(err);
        });
    }

    //
    // _parseMetrics and _getMetrics are used to flatten out all metrics (e.g. json blobs emitted from plugins)
    //

    _parseMetrics(rawMetrics) {
        const metricList = {};

        for (const group in rawMetrics) { // eslint-disable-line guard-for-in
            metricList[group] = this._getMetrics(null, rawMetrics[group]);
        }

        return metricList;
    }

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


    getGroups(cb) {
        assert.strictEqual(typeof cb, 'function', 'cb must be a callback function');

        instance.load((err) => {
            if (err) {
                return cb(err);
            }
            return cb(null, groups);
        });
    }

    getMetrics(cb) {
        assert.strictEqual(typeof cb, 'function', 'cb must be a callback function');

        instance.load((err) => {
            if (err) {
                return cb(err);
            }
            return cb(null, metrics);
        });
    }

    getGroupMetrics(group, cb) {
        assert.strictEqual(typeof group, 'string', 'group is required');
        assert.strictEqual(typeof cb, 'function', 'cb must be a callback function');

        instance.load((err) => {
            if (err) {
                return cb(err);
            }

            if (!{}.hasOwnProperty.call(metrics, group)) {
                return cb(new Error(`Unknown metric group '${group}'`));
            }

            return cb(null, metrics[group]);
        });
    }

    getMetricStats(cb) {
        assert.strictEqual(typeof cb, 'function', 'cb must be a callback function');

        instance.load((err) => {
            if (err) {
                return cb(err);
            }

            const stats = {};

            for (let i = 0; i < groups.length; i++) {
                stats[groups[i]] = Object.keys(metrics[groups[i]]).length;
            }

            return cb(null, stats);

        });
    }
}

module.exports = Metrics;

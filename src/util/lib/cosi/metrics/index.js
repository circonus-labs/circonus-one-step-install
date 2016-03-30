"use strict";

/*eslint-env node, es6 */
/*eslint-disable no-magic-numbers, consistent-return */

const assert = require("assert");
const url = require("url");

const chalk = require("chalk");

let instance = null;

let metrics = {};
let groups = [];

class Metrics {
    constructor(agentUrl) {
        if (instance !== null) {
            return instance;
        }
        assert.strictEqual(typeof agentUrl, "string", "agentUrl is required");

        this.url = url.parse(agentUrl);
        if (this.url.protocol === "https:") {
            this.client = require("https"); //eslint-disable-line global-require
        }
        else {
            this.client = require("http"); //eslint-disable-line global-require
        }
        metrics = {};
        groups = [];

        instance = this; //eslint-disable-line consistent-this

        return instance;

    }

    load(cb) {
        assert.strictEqual(typeof cb, "function", "cb must be a callback function");

        if (groups.length > 0) {
            return cb(null, true);
        }

        instance.client.get(instance.url, (res) => {
            let data = "";

            res.on("data", (chunk) => {
                data += chunk;
            });

            res.on("end", () => {
                if (res.statusCode !== 200) {
                    return cb(new Error(`${res.statusCode} ${res.statusMessage} ${data}`));
                }

                try {
                    metrics = JSON.parse(data);
                    groups = Object.keys(metrics);
                }
                catch (err) {
                    return cb(err);
                }

                return cb(null, true);
            });
        }).on("error", (err) => {
            if (err.code === "ECONNREFUSED") {
                console.error(chalk.red("Fetch metrics - unable to connect to NAD"), url.format(this.url), err.toString());
                process.exit(1); //eslint-disable-line no-process-exit
            }
            return cb(err);
        });
    }

    getGroups(cb) {
        assert.strictEqual(typeof cb, "function", "cb must be a callback function");

        instance.load((err) => {
            if (err) {
                return cb(err);
            }
            return cb(null, groups);
        });
    }

    getMetrics(cb) {
        assert.strictEqual(typeof cb, "function", "cb must be a callback function");

        instance.load((err) => {
            if (err) {
                return cb(err);
            }
            return cb(null, metrics);
        });
    }

    getGroupMetrics(group, cb) {
        assert.strictEqual(typeof group, "string", "group is required");
        assert.strictEqual(typeof cb, "function", "cb must be a callback function");

        instance.load((err) => {
            if (err) {
                return cb(err);
            }

            if (!metrics.hasOwnProperty(group)) {
                return cb(new Error(`Unknown metric group '${group}'`));
            }

            return cb(null, metrics[group]);
        });
    }

    getMetricStats(cb) {
        assert.strictEqual(typeof cb, "function", "cb must be a callback function");

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

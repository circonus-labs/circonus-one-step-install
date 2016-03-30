"use strict";

/*eslint-env node, es6 */
/*eslint-disable no-magic-numbers, consistent-return */

const assert = require("assert");
const Events = require("events").EventEmitter;
const path = require("path");
const qs = require("querystring");
const url = require("url");

const api = require("circonusapi2");
const chalk = require("chalk");

const cosi = require(path.resolve(path.join(__dirname, "..")));

let brokerList = null;

class Broker extends Events {

    constructor(quiet) {
        super();

        this.verbose = !quiet;

        this.defaultBrokerId = null;
        this.defaultBroker = null;

    }

    getBrokerList(cb) {
        assert.strictEqual(typeof cb, "function", "cb must be a callback function");

        const self = this;

        if (brokerList !== null) {
            return cb(null, brokerList);
        }

        this.once("fbl.start", this._fbl);

        this.once("fbl.error", (err) => {
            self.removeAllListenrs("fbl.done");
            return cb(err);
        });

        this.once("fbl.done", () => {
            return cb(null, brokerList);
        });

        this.emit("fbl.start");
    }


    getBrokerInfo(id, cb) {
        assert.strictEqual(typeof id, "string", "id must be a string");
        assert.strictEqual(typeof cb, "function", "cb must be a callback function");

        const brokerCid = `/broker/${id}`;

        this.getBrokerList((err, brokers) => {
            if (err) {
                console.log("broker.info list call");
                console.dir(err);
                return cb(err);
            }

            for (let i = 0; i < brokers.length; i++) {
                if (brokers[i]._cid === brokerCid) {
                    return cb(null, brokers[i]);
                }
            }
            return cb(new Error(`No broker found with id ${id}`));
        });
    }

    getDefaultBroker(cb) {
        assert.strictEqual(typeof cb, "function", "cb must be a callback function");

        const self = this;

        this.once("gdb.error", (err) => {
            console.dir(err);
            self.removeAllListeners("gdb.done");
            return cb(err);
        });

        this.once("gdb.done", (broker) => {
            self.defaultBroker = broker;
            if (self.verbose) {
                console.log(`${chalk.green("Default broker identified")}, using: ${self.defaultBroker._name} ID:${self.defaultBrokerId}`);
            }
            return cb(null, self.defaultBroker);
        });

        this._gdb();
    }

    /*
     * private methods, well, will be when classes support such
     */

     // fetch broker list
    _fbl() {
        const self = this;

        api.setup(cosi.api_key, cosi.api_app, cosi.api_url);
        api.get("/broker", null, (code, err, brokers) => {

            if (code < 200 || code >= 400) {
                console.error(chalk.red("Circonus API error"), code, err, brokers);

                const apiError = new Error("Circonus API error");

                apiError.code = code;
                apiError.details = {
                    error: err,
                    body: brokers
                };
                self.emit("fbl.error", apiError);
            }
            else {
                brokerList = brokers;
                self.emit("fbl.done");
            }
        });
    }

    // get default broker
    _gdb() {
        const self = this;

        // 1. custom
        //    a) options broker.id
        //    b) options broker.list[broker.default]
        // 2. first "enterprise" broker in brokerList
        // 3. punt, use COSI default "circonus" broker

        this.getBrokerList((err) => {
            if (err) {
                throw err;
            }

            self.once("gdb.error", () => {
                self.removeAllListenrs("gdb.custom");
                self.removeAllListenrs("gdb.enterprise");
                self.removeAllListenrs("gdb.cosi");
                self.removeAllListenrs("gdb.verify");
                self.removeAllListenrs("gdb.valid");
            });

            if (self.defaultBrokerId === null) {
                self.once("gdb.custom", self._gdbc);
                self.once("gdb.enterprise", self._gdbe);
                self.once("gdb.cosi", self._gdbd);
            }

            self.once("gdb.verify", self._gdbv);
            self.once("gdb.valid", (broker) => {
                self.defaultBrokerId = broker._cid.replace("/broker/", "");
                self.emit("gdb.done", broker);
            });

            if (self.defaultBrokerId === null) {
                self.emit("gdb.custom");
            }
            else {
                self.emit("gdb.verify", self.defaultBrokerId);
            }
        });
    }

    // default broker, custom options
    _gdbc() {
        const self = this;

        function log(msg) {
            if (self.verbose) {
                console.log(msg);
            }
        }

        log("Checking for custom broker settings");

        let brokerId = null;

        if (this.defaultBrokerId === null && cosi.custom_options.hasOwnProperty("broker")) {
            const customBroker = cosi.custom_options.broker;

            if (customBroker.id) {
                brokerId = customBroker.id;
                log(`Customer broker ID found ${customBroker.id}`);
            }
            else if (customBroker.list && customBroker.default) {
                const list = customBroker.list;
                const idx = customBroker.default;

                log("Customer broker list found");

                if (Array.isArray(list)) {
                    if (idx !== -1 || (idx < 0 || idx > list.length)) {
                        console.log(chalk.yellow("WARN", "custom options, broker.default is not in bounds of broker.list, ignoring."));
                    }
                    else {
                        brokerId = list[ idx === -1 ? Math.floor(Math.random() * list.length) : idx ];
                        log(`Custom broker ID from supplied list ${brokerId}`);
                    }
                }
                else {
                    console.log(chalk.yellow("WARN"), "custom options, broker.list is not an array, ignoring.");
                }
            }
        }

        if (brokerId === null) {
            this.emit("gdb.enterprise");
        }
        else {
            this.emit("gdb.verify", brokerId);
        }
    }

    // default broker, enterprise
    _gdbe() {
        const self = this;

        function log(msg) {
            if (self.verbose) {
                console.log(msg);
            }
        }

        log("Checking for enterprise brokers");

        if (this.defaultBrokerId === null) {
            this.getBrokerList((err, brokers) => {
                if (err) {
                    self.emit("gdb.error", err);
                }
                for (let i = 0; i < brokers.length; i++) {
                    if (brokers[i]._type === "enterprise") {
                        const brokerId = brokers[i]._cid.replace("/broker/", "");

                        log(`Identified enterprise broker ID ${brokerId}`);
                        self.emit("gdb.verify", brokerId);
                        return;
                    }
                }
                self.emit("gdb.cosi");
            });
        }
    }

    // default broker, cosi
    _gdbd() {
        const self = this;

        function log(msg) {
            if (self.verbose) {
                console.log(msg);
            }
        }

        log("Checking COSI for default broker");

        const query = {
            type: cosi.cosi_os_type,
            dist: cosi.cosi_os_dist,
            vers: cosi.cosi_os_vers,
            arch: cosi.cosi_os_arch,
            mode: cosi.agent_mode
        };

        const cosiUrl = url.parse(`${cosi.cosi_url}broker?${qs.stringify(query)}`);
        let client = null;

        if (cosiUrl.protocol === "https:") {
            client = require("https"); //eslint-disable-line global-require
        }
        else {
            client = require("http"); //eslint-disable-line global-require
        }

        client.get(cosiUrl.format(), (res) => {
            let data = "";

            res.on("data", (chunk) => {
                data += chunk;
            });

            res.on("end", () => {
                if (res.statusCode !== 200) {
                    console.error(chalk.red("COSI API error"), res.statusCode, res.statusMessage, data);

                    const apiError = new Error("COSI API error");

                    apiError.code = res.statusCode;
                    apiError.details = {
                        msg: res.statusMessage,
                        data
                    };
                    self.emit("gdb.error", apiError);
                }

                let broker = null;

                try {
                    broker = JSON.parse(data);
                    if (broker.broker_id) {
                        log(`COSI default broker ID ${broker.broker_id}`);
                        self.emit("gdb.verify", broker.broker_id);
                    }
                    else {
                        throw new Error("No broker id found in cosi api response");
                    }
                }
                catch (err) {
                    console.error(chalk.red("COSI API error"), "parsing response", data, err);
                    self.emit("gdb.error", err);
                }
            });
        }).on("error", (err) => {
            if (err.code === "ECONNREFUSED") {
                console.error(chalk.red("Fetch default broker - unable to connect to COSI"), self.cosiUrl.href, err.toString());
                process.exit(1); //eslint-disable-line no-process-exit
            }
        });
    }

    // verify default broker
    _gdbv(brokerId) {
        const self = this;

        function log(msg) {
            if (self.verbose) {
                console.log(msg);
            }
        }

        log(`Verifying default broker ID ${brokerId}`);

        if (!brokerId) {
            this.emit("gdb.error", new Error("Unable to verify unset broker id"));
            return;
        }

        this.getBrokerList((err, brokers) => {
            if (err) {
                self.emit("gdb.error", err);
                return;
            }

            const cid = `/broker/${brokerId}`;

            for (let i = 0; i < brokers.length; i++) {
                if (brokers[i]._cid === cid) {
                    log(`${chalk.green("Verified")} broker ID ${brokerId}`);
                    self.emit("gdb.valid", brokers[i]);
                    return;
                }
            }
            self.emit("gdb.error", new Error(`Specified broker id ${brokerId}, is not valid.`));
        });
    }
}

module.exports = Broker;

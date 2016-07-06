"use strict";

/*eslint-env node, es6 */
/*eslint-disable no-magic-numbers, consistent-return, no-process-exit */

const assert = require("assert");
const path = require("path");
const https = require("https");
const http = require("http");

const chalk = require("chalk");
const ct = require("connection-tester");

const cosi = require(path.resolve(path.join(__dirname, "..")));
const api = require(path.resolve(cosi.lib_dir, "api"));

let brokerList = null;
let defaultBrokerConfig = null;

class Broker {

    constructor(quiet) {
        this.verbose = !quiet;
        this.defaultBrokers = {};
    }

    _verifyCustomBroker(id, checkType) {
        if (id !== null) {
            const broker = this.getBrokerById(id);

            if (this._isValidBroker(broker, checkType)) {
                return id;
            }

            console.log(chalk.yellow("WARN"), "Invalid broker", broker._name, "is not valid for", checkType, "-- checking next option.");

        }
        return null;
    }

    // get the default broker to use for a specific check type
    getDefaultBroker(checkType, cb) {
        assert.strictEqual(typeof checkType, "string", "checkType must be a string");
        assert.strictEqual(typeof cb, "function", "cb must be a callback function");

        // already verified
        if (this.defaultBrokers.hasOwnProperty(checkType)) {
            return cb(null, this.defaultBrokers[checkType]);
        }

        const self = this;

        this.getBrokerList((errGBL) => {
            if (errGBL) {
                console.error(chalk.red("ERROR:"), "Fetching broker list from API", errGBL);
                process.exit(1);
            }
            self.getDefaultBrokerList((errGDBL) => {
                if (errGDBL) {
                    console.error(chalk.red("ERROR:"), "Fetching broker list from API", errGDBL);
                    process.exit(1);
                }

                let brokerId = self._verifyCustomBroker(self._getCustomBroker(), checkType);

                if (brokerId === null) {
                    brokerId = self._getEnterpriseBroker(checkType);
                }

                if (brokerId === null) {
                    brokerId = self._getCosiBroker(checkType);
                }

                if (brokerId === null) {
                    console.error(chalk.red("ERROR"), "Unable to determine broker to use.");
                    process.exit(1);
                }

                const broker = self.getBrokerById(brokerId);

                if (self._isValidBroker(broker, checkType)) {
                    self.defaultBrokers[checkType] = broker;
                }
                else {
                    console.error(chalk.red("ERROR"), "Invalid broker", broker._name, "is not valid for", checkType);
                    process.exit(1);
                }

                return cb(null, broker);
            });
        });
    }

    // Get list of brokers available to api token
    getBrokerList(cb) {
        assert.strictEqual(typeof cb, "function", "cb must be a callback function");

        if (brokerList !== null) {
            return cb(null, brokerList);
        }

        if (this.verbose) {
            console.log("Fetching broker list from Circonus");
        }

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
                return cb(apiError);
            }

            brokerList = [];

            // filter broker groups which do not have a minimum of
            // one member in an active state.
            for (let i = 0; i < brokers.length; i++) {
                const broker = brokers[i];

                let active = 0;

                for (let j = 0; j < broker._details.length; j++) {
                    const detail = broker._details[j];

                    if (detail.status === "active") {
                        active++;
                    }
                }

                if (active > 0) {
                    brokerList.push(broker);
                }
            }

            return cb(null, brokerList);
        });
    }

    // return the default brokers from custom configuration or cosi
    getDefaultBrokerList(cb) {
        assert.strictEqual(typeof cb, "function", "cb must be a callback function");

        if (defaultBrokerConfig !== null) {
            return cb(null, defaultBrokerConfig);
        }

        if (this.verbose) {
            console.log("Checking Custom configuration for default broker list");
        }

        if (cosi.custom_options.hasOwnProperty("broker")) {
            if (cosi.custom_options.broker.hasOwnProperty("default")) {
                const reqBrokerKeys = [ "fallback", "json", "httptrap" ];
                let ok = true;

                for (let i = 0; i < reqBrokerKeys.length; i++) {
                    const listKey = reqBrokerKeys[i];
                    const idxKey = `${listKey}_default`;

                    if (!cosi.custom_options.broker.default.hasOwnProperty(listKey)) {
                        ok = false;
                        break;
                    }
                    if (!cosi.custom_options.broker.default.hasOwnProperty(idxKey)) {
                        ok = false;
                        break;
                    }
                }

                // if the list is invalid, exit since it was an explicit user configuration
                if (!ok) {
                    console.error(chalk.red("WARN:"), "custom broker list found but, is invalid.");
                    process.exit(1);
                }

                // we want a *copy* of it, not a reference to the original...
                defaultBrokerConfig = JSON.parse(JSON.stringify(cosi.custom_options.broker.default));
                return cb(null, defaultBrokerConfig);
            }
        }


        if (this.verbose) {
            console.log("Fetching default broker list from COSI");
        }

        const reqOptions = cosi.getProxySettings(`${cosi.cosi_url}brokers`);
        let client = null;

        if (reqOptions.protocol === "https:") {
            client = https;
        }
        else {
            client = http;
        }

        client.get(reqOptions, (res) => {
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
                    return cb(apiError);
                }

                let brokers = null;

                try {
                    brokers = JSON.parse(data);
                }
                catch (err) {
                    console.error(chalk.red("COSI API error"), "parsing response", data, err);
                    return cb(err);
                }

                defaultBrokerConfig = brokers;
                return cb(null, defaultBrokerConfig);

            });
        }).on("error", (err) => {
            if (err.code === "ECONNREFUSED") {
                console.error(chalk.red("Fetch default broker list - unable to connect to COSI"), reqOptions, err.toString());
                process.exit(1);
            }
        });
    }

    // get broker object for a specific broker id
    getBrokerById(id) {
        const brokerId = id.toString();

        if (!brokerId.match(/^[0-9]+$/)) {
            throw new Error("Invalid broker id, must only be digits.");
        }

        const brokerCid = `/broker/${brokerId}`;

        for (let i = 0; i < brokerList.length; i++) {
            if (brokerList[i]._cid === brokerCid) {
                return JSON.parse(JSON.stringify(brokerList[i]));
            }
        }
        console.error(chalk.red("ERROR:"), `No broker found with id ${brokerId}`);
        process.exit(1);
    }

    // default broker, custom options
    _getCustomBroker() {

        if (this.verbose) {
            console.log("Checking for custom broker settings");
        }

        // command line --broker trumps all

        if (cosi.hasOwnProperty("cosi_broker_id")) {
            if (this.verbose) {
                console.log(`Using broker from command line: ${cosi.cosi_broker_id}`);
            }
            if (!cosi.cosi_broker_id.match(/^\d+$/)) {
                console.error(chalk.red("Invalid broker specified on command line", cosi.cosi_broker_id, "should be a number."));
                process.exit(1);
            }
            return cosi.cosi_broker_id;
        }

        // check if registration options config file has a broker section

        if (!cosi.custom_options.hasOwnProperty("broker")) {
            return null;
        }

        const customBroker = cosi.custom_options.broker;

        // does it have a specific id to use

        if (customBroker.id) {
            if (this.verbose) {
                console.log(`Customer broker ID found ${customBroker.id}`);
            }
            return customBroker.id;
        }

        // does it have a list of brokers from which to pick (a specific or random one)

        if (customBroker.list && customBroker.default) {
            const list = customBroker.list;
            const idx = customBroker.default;

            if (this.verbose) {
                console.log("Customer broker list found");
            }

            if (Array.isArray(list) && list.length > 0) {
                if (idx !== -1 || (idx < 0 || idx > list.length)) {
                    console.log(chalk.yellow("WARN", "custom options, broker.default is not in bounds of broker.list, ignoring."));
                }
                else {
                    const brokerId = list[ idx === -1 ? Math.floor(Math.random() * list.length) : idx ];

                    if (this.verbose) {
                        console.log(`Custom broker ID from supplied list ${brokerId}`);
                    }
                    return brokerId;
                }
            }
            else {
                console.warn(chalk.yellow("WARN"), "custom options, broker.list is not an array or has no elements, ignoring.");
            }
        }

        return null;
    }

    // default broker, enterprise
    _getEnterpriseBroker(checkType) {
        assert.strictEqual(typeof checkType, "string", "checkType must be a string");

        if (this.verbose) {
            console.log("Checking for enterprise brokers");
        }

        const enterpriseBrokers = [];

        for (let i = 0; i < brokerList.length; i++) {
            const broker = brokerList[i];

            if (broker._type !== "enterprise") {
                continue;
            }
            if (!this._isValidBroker(broker, checkType)) {
                continue;
            }
            for (let j = 0; j < broker._details.length; j++) {
                const detail = broker._details[j];

                if (detail.status !== "active") {
                    continue;
                }

                if (this._brokerConnectionTest(detail, 500)) {
                    enterpriseBrokers.push(JSON.parse(JSON.stringify(broker)));
                    break;
                }
            }
        }

        if (enterpriseBrokers.length === 0) {
            return null;
        }

        const brokerIdx = Math.floor(Math.random() * enterpriseBrokers.length);
        const brokerId = enterpriseBrokers[brokerIdx]._cid.replace("/broker/", "");

        if (this.verbose) {
            console.log("Found enterprise brokers, using", brokerId, enterpriseBrokers[brokerIdx]._name);
        }

        return brokerId;
    }

    // default broker from cosi (circonus brokers)
    _getCosiBroker(checkType) {
        let brokerId = null;

        if (defaultBrokerConfig.hasOwnProperty(checkType)) {
            brokerId = defaultBrokerConfig[checkType];
        }

        if (this.verbose) {
            console.log(`COSI default broker used ${brokerId}`);
        }

        return brokerId;
    }


    _brokerSupportsCheckType(detail, checkType) {
        for (let i = 0; i < detail.modules.length; i++) {
            if (detail.modules[i] === checkType) {
                return true;
            }
        }
        return false;
    }


    _brokerConnectionTest(detail, maxResponseTime) {
        const maxTime = maxResponseTime || 500;
        const port = detail.external_port || 43191;
        let host = detail.ipaddress;

        if (detail.cn === detail.external_host) {
            host = detail.external_host;
        }

        const status = ct.test(host, port, maxTime);

        if (this.verbose) {
            if (status.success) {
                console.log(chalk.green(`\t${host}:${port}`), "OK");
            }
            else {
                console.log(chalk.yellow(`\t${host}:${port}`), status.error);
            }
        }

        return status.success;
    }


    _isValidBroker(broker, checkType) {

        if (broker._name === "composite" && checkType !== "composite") {
            return false;
        }

        let valid = false;

        for (let i = 0; i < broker._details.length; i++) {
            const detail = broker._details[i];

            if (detail.status !== "active") {
                continue; // ignore broker group members in any state other than "active"
            }

            if (this._brokerSupportsCheckType(detail, checkType)) {
                valid = true;
                break;
            }
        }

        return valid;
    }

}

module.exports = Broker;

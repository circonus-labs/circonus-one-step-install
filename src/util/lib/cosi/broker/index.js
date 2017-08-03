// Copyright 2016 Circonus, Inc. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

'use strict';

const assert = require('assert');
const path = require('path');
const https = require('https');
const http = require('http');

const chalk = require('chalk');
const ct = require('connection-tester');

const cosi = require(path.resolve(path.join(__dirname, '..')));
const api = require(path.resolve(cosi.lib_dir, 'api'));

let instance = null;

class Broker {

    /**
     * create new broker object
     * @arg {Boolean} quiet messages
     */
    constructor(quiet) {
        if (instance !== null) {
            return instance;
        }

        this.brokerList = null;
        this.defaultBrokerConfig = null;
        this.verbose = !quiet;
        this.defaultBrokers = {};
        instance = this; // eslint-disable-line consistent-this
    }

    /**
     * get the default broker to use for a specific check type
     * @arg {String} checkType type of check broker needs to support
     * @returns {Object} promise
     */
    getDefaultBroker(checkType) {
        return new Promise((resolve, reject) => {
            if (typeof checkType !== 'string') {
                reject(new Error('checkType must be a string'));

                return;
            }

            // already verified
            if ({}.hasOwnProperty.call(this.defaultBrokers, checkType)) {
                resolve(this.defaultBrokers[checkType]);

                return;
            }

            this.getBrokerList().
                catch((err) => {
                    console.error(chalk.red('ERROR:'), 'Fetching broker list from API', err);
                    process.exit(1);
                }).
                then(() => {
                    return this.getDefaultBrokerList();
                }).
                then(() => {
                    let brokerId = this._verifyCustomBroker(this._getCustomBroker(), checkType);

                    if (brokerId === null) {
                        brokerId = this._getEnterpriseBroker(checkType);
                    }

                    if (brokerId === null) {
                        brokerId = this._getCosiBroker(checkType);
                    }

                    if (brokerId === null) {
                        console.error(chalk.red('ERROR'), 'Unable to determine broker to use.');
                        process.exit(1);
                    }

                    const broker = this.getBrokerById(brokerId);

                    if (this._isValidBroker(broker, checkType)) {
                        this.defaultBrokers[checkType] = broker;
                    } else {
                        console.error(chalk.red('ERROR'), 'Invalid broker', broker._name, 'is not valid for', checkType);
                        process.exit(1);
                    }

                    resolve(broker);
                }).
                catch((err) => {
                    console.error(chalk.red('ERROR:'), 'Fetching default broker list from COSI API', err);
                    process.exit(1);
                });
        });
    }

    /**
     * Get list of brokers available to api token
     * @returns {Object} promise
     */
    getBrokerList() {
        return new Promise((resolve, reject) => {
            if (this.brokerList !== null) {
                resolve(this.brokerList);

                return;
            }

            if (this.verbose) {
                console.log('Fetching broker list from Circonus');
            }

            api.get('/broker', null).
                then((res) => {
                    const parsed_body = res.parsed_body;
                    const code = res.code;
                    const raw_body = res.raw_body;

                    if (parsed_body === null) {
                        const err = new Error('Circonus API returned null broker list');

                        err.code = code;
                        err.details = {
                            parsed_body,
                            raw_body
                        };
                        reject(err);

                        return;
                    }

                    if (code < 200 || code >= 400) {
                        const err = new Error('Circonus API error');

                        err.code = code;
                        err.details = {
                            parsed_body,
                            raw_body
                        };

                        reject(err);

                        return;
                    }

                    this.brokerList = [];

                    // filter broker groups which do not have a minimum of
                    // one member in an active state.
                    for (const broker of parsed_body) {
                        for (const detail of broker._details) {
                            if (detail.status === 'active') {
                                this.brokerList.push(broker);
                                break;
                            }
                        }
                    }

                    resolve(this.brokerList);
                }).
                catch((err) => {
                    reject(err);
                });
        });
    }

    /**
     * return the default brokers from custom configuration or cosi
     * @returns {Object} promise
     */
    getDefaultBrokerList() {
        return new Promise((resolve, reject) => {
            if (this.defaultBrokerConfig !== null) {
                resolve(this.defaultBrokerConfig);

                return;
            }

            if (this.verbose) {
                console.log('Checking Custom configuration for default broker list');
            }

            if ({}.hasOwnProperty.call(cosi.custom_options, 'broker')) {
                if ({}.hasOwnProperty.call(cosi.custom_options.broker, 'default')) {
                    const reqBrokerKeys = [ 'fallback', 'json', 'httptrap' ];
                    let ok = true;

                    for (let i = 0; i < reqBrokerKeys.length; i++) {
                        const listKey = reqBrokerKeys[i];
                        const idxKey = `${listKey}_default`;

                        if (!{}.hasOwnProperty.call(cosi.custom_options.broker.default, listKey)) {
                            ok = false;
                            break;
                        }
                        if (!{}.hasOwnProperty.call(cosi.custom_options.broker.default, idxKey)) {
                            ok = false;
                            break;
                        }
                    }

                    // if the list is invalid, exit since it was an explicit user configuration
                    if (!ok) {
                        console.error(chalk.red('WARN:'), 'custom broker list found but, is invalid.');
                        process.exit(1);
                    }

                    // we want a *copy* of it, not a reference to the original...
                    this.defaultBrokerConfig = JSON.parse(JSON.stringify(cosi.custom_options.broker.default));

                    resolve(this.defaultBrokerConfig);

                    return;
                }
            }


            if (this.verbose) {
                console.log('Fetching default broker list from COSI');
            }

            const reqOptions = cosi.getProxySettings(`${cosi.cosi_url}brokers`);
            const self = this;
            let client = null;

            if (reqOptions.protocol === 'https:') {
                client = https;
            } else {
                client = http;
            }

            client.get(reqOptions, (res) => {
                let data = '';

                res.on('data', (chunk) => {
                    data += chunk;
                });

                res.on('end', () => {
                    if (res.statusCode !== 200) {
                        console.error(chalk.red('COSI API error'), res.statusCode, res.statusMessage, data);

                        const err = new Error('COSI API error');

                        err.code = res.statusCode;
                        err.details = {
                            data,
                            msg: res.statusMessage
                        };

                        reject(err);

                        return;
                    }

                    let brokers = null;

                    try {
                        brokers = JSON.parse(data);
                    } catch (err) {
                        console.error(chalk.red('COSI API error'), 'parsing response', data, err);
                        reject(err);

                        return;
                    }

                    self.defaultBrokerConfig = brokers;

                    resolve(self.defaultBrokerConfig);
                });
            }).on('error', (err) => {
                if (err.code === 'ECONNREFUSED') {
                    console.error(chalk.red('Fetch default broker list - unable to connect to COSI'), reqOptions, err.toString());
                    process.exit(1);
                }
            });
        });
    }

    /**
     * get broker object for a specific broker id
     * @arg {String} id of broker
     * @returns {Object} broker
     */
    getBrokerById(id) { // eslint-disable-line class-methods-use-this
        const brokerId = id.toString();

        if (!brokerId.match(/^[0-9]+$/)) {
            throw new Error('Invalid broker id, must only be digits.');
        }

        const brokerCid = `/broker/${brokerId}`;

        for (const broker of this.brokerList) {
            if (broker._cid === brokerCid) {
                return JSON.parse(JSON.stringify(broker));
            }
        }
        console.error(chalk.red('ERROR:'), `No broker found with id ${brokerId}`);
        process.exit(1);

        return null;
    }

    /**
     * default broker, custom options
     * @returns {String} broker id or null
     */
    _getCustomBroker() {
        if (this.verbose) {
            console.log('Checking for custom broker settings');
        }

        // command line --broker trumps all

        if ({}.hasOwnProperty.call(cosi, 'cosi_broker_id')) {
            if (this.verbose) {
                console.log(`Using broker from command line: ${cosi.cosi_broker_id}`);
            }
            if (!cosi.cosi_broker_id.match(/^\d+$/)) {
                console.error(chalk.red('Invalid broker specified on command line', cosi.cosi_broker_id, 'should be a number.'));
                process.exit(1);
            }

            return cosi.cosi_broker_id;
        }

        // check if registration options config file has a broker section

        if (!{}.hasOwnProperty.call(cosi.custom_options, 'broker')) {
            return null;
        }

        const customBroker = cosi.custom_options.broker;

        // does the custom configuration have a specific id to use

        if (customBroker.id) {
            if (this.verbose) {
                console.log(`Customer broker ID found ${customBroker.id}`);
            }

            return customBroker.id;
        }

        // does the custom configuration have a list of brokers from which to pick (a specific or random one)

        if (customBroker.list && customBroker.default) {
            const list = customBroker.list;
            const idx = customBroker.default;

            if (this.verbose) {
                console.log('Customer broker list found');
            }

            if (Array.isArray(list) && list.length > 0) {
                if (idx !== -1 || (idx < 0 || idx > list.length)) {
                    console.log(chalk.yellow('WARN', 'custom options, broker.default is not in bounds of broker.list, ignoring.'));
                } else {
                    const brokerId = list[idx === -1 ? Math.floor(Math.random() * list.length) : idx];

                    if (this.verbose) {
                        console.log(`Custom broker ID from supplied list ${brokerId}`);
                    }

                    return brokerId;
                }
            } else {
                console.warn(chalk.yellow('WARN'), 'custom options, broker.list is not an array or has no elements, ignoring.');
            }
        }

        return null;
    }

    /**
     * default broker, enterprise
     * @arg {String} checkType type of check the broker must support
     * @returns {String} enterprise broker id or null
     */
    _getEnterpriseBroker(checkType) {
        assert.strictEqual(typeof checkType, 'string', 'checkType must be a string');

        let forceEnterprise = false;

        if ({}.hasOwnProperty.call(cosi, 'cosi_broker_type')) {
            if (cosi.cosi_broker_type.toLowerCase() === 'enterprise') {
                forceEnterprise = true;
            }
        }

        if (this.verbose) {
            console.log('Checking for enterprise brokers');
        }

        const enterpriseBrokers = [];
        let numValidBrokers = 0;

        for (const broker of this.brokerList) {
            if (broker._type !== 'enterprise') {
                continue;
            }
            if (!this._isValidBroker(broker, checkType)) {
                continue;
            }

            numValidBrokers += 1;

            for (const detail of broker._details) {
                if (detail.status !== 'active') {
                    continue;
                }

                if (this._brokerConnectionTest(detail, 500)) {
                    enterpriseBrokers.push(JSON.parse(JSON.stringify(broker))); // copies not references
                    break;
                }
            }
        }

        if (enterpriseBrokers.length === 0) {
            if (forceEnterprise) {
                if (numValidBrokers > 0) {
                    console.error(chalk.red('ERROR:'), numValidBrokers, 'broker type set to "enterprise", enterprise brokers found but, none could be reached.');
                } else {
                    console.error(chalk.red('ERROR:'), 'broker type set to "enterprise", no enterprise brokers found.');
                }
                process.exit(1);
            }

            return null;
        }

        const brokerIdx = Math.floor(Math.random() * enterpriseBrokers.length);
        const brokerId = enterpriseBrokers[brokerIdx]._cid.replace('/broker/', '');

        if (this.verbose) {
            console.log('Found enterprise brokers, using', brokerId, enterpriseBrokers[brokerIdx]._name);
        }

        return brokerId;
    }

    /**
     * default broker from cosi (circonus brokers)
     * @arg {String} checkType type of check broker must support
     * @returns {String} broker id or null
     */
    _getCosiBroker(checkType) {
        let brokerId = null;

        if ({}.hasOwnProperty.call(this.defaultBrokerConfig, checkType)) {
            brokerId = this.defaultBrokerConfig[checkType];
        }

        if (this.verbose) {
            console.log(`COSI default broker used ${brokerId}`);
        }

        return brokerId;
    }


    /**
     * check if broker supports a specific check type
     * @arg {Array} detail for broker
     * @arg {String} checkType type of check
     * @returns {Boolean} whether the check type is supported
     */
    _brokerSupportsCheckType(detail, checkType) { // eslint-disable-line class-methods-use-this
        for (let i = 0; i < detail.modules.length; i++) {
            if (detail.modules[i] === checkType) {
                return true;
            }
        }

        return false;
    }


    /**
     * test connectivity to a broker (not valid if no connection can be made or the response time is too long)
     * @arg {Object} detail for broker
     * @arg {Number} maxResponseTime in milliseconds
     * @returns {Boolean} success or failure
     */
    _brokerConnectionTest(detail, maxResponseTime) {
        const maxTime = maxResponseTime || 500;
        const port = detail.external_port || 43191;
        const host = detail.external_host || detail.ipaddress; // preference external_host, if not defined use broker's IP

        if (host === null && this.verbose) {
            console.log(chalk.yellow('\tWARN:'), `'${detail.cn}' - no external_host or ipaddress, skipping.`);

            return false;
        }

        const status = ct.test(host, port, maxTime);

        if (this.verbose) {
            if (status.success) {
                console.log(chalk.green(`\t${host}:${port}`), 'OK');
            } else {
                console.log(chalk.yellow(`\t${host}:${port}`), status.error);
            }
        }

        return status.success;
    }


    /**
     * is a given broker a valid broker
     * @arg {Object} broker object
     * @arg {String} checkType needed
     * @returns {Boolean} valid or not
     */
    _isValidBroker(broker, checkType) {
        if (broker._name === 'composite' && checkType !== 'composite') {
            return false;
        }

        let valid = false;

        for (const detail of broker._details) {
            if (detail.status !== 'active') {
                continue; // ignore broker group members in any state other than "active"
            }

            if (this._brokerSupportsCheckType(detail, checkType)) {
                valid = true;
                break;
            }
        }

        return valid;
    }

    /**
     * verify a user-supplied, custom broker
     * @arg {String} id of broker
     * @arg {String} checkType needed
     * @returns {String} broker id or null
     */
    _verifyCustomBroker(id, checkType) {
        if (id !== null) {
            const broker = this.getBrokerById(id);

            if (this._isValidBroker(broker, checkType)) {
                return id;
            }

            console.log(chalk.yellow('WARN'), 'Invalid broker', broker._name, 'is not valid for', checkType, '-- checking next option.');
        }

        return null;
    }

}

module.exports = Broker;

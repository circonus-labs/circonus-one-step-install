// Copyright 2016 Circonus, Inc. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

'use strict';

const assert = require('assert');
const path = require('path');
const fs = require('fs');

const chalk = require('chalk');

const cosi = require(path.resolve(path.join(__dirname, '..')));
const api = require(path.resolve(cosi.lib_dir, 'api'));

module.exports = class Check {

    /**
     * create dashboard object from config file
     * @arg {String} configFile to load (config|registration|template)-check-.*\.json)
     */
    constructor(configFile) {
        if (!configFile) {
            throw new Error('Missing Argument: configFile');
        }

        if (!configFile.match(/\/(config|registration|template)-check-.*\.json/)) {
            throw new Error(`Invalid check configuration file '${configFile}'`);
        }

        const cfgFile = path.resolve(configFile);

        try {
            const cfg = require(cfgFile); // eslint-disable-line global-require

            if ({}.hasOwnProperty.call(cfg, 'check')) {
                this._init(cfg.check);  // template (templates contain extra metadata)
            } else {
                this._init(cfg);        // config or registration
            }
        } catch (err) {
            if (err.code === 'MODULE_NOT_FOUND') {
                console.error(chalk.red('ERROR - check configuration file not found:'), cfgFile);
                process.exit(1);
            } else {
                throw err;
            }
        }
    }

    /**
     * save current config to file
     * @arg {String} fileName to save
     * @arg {Boolean} force overwrite if it exists
     * @returns {String} name of file saved, or throws an error on failure
     */
    save(fileName, force) {
        assert.strictEqual(typeof fileName, 'string', 'fileName is required');

        try {
            fs.writeFileSync(fileName, JSON.stringify(this, null, 4), {
                encoding : 'utf8',
                flag     : force ? 'w' : 'wx',
                mode     : 0o640
            });
        } catch (err) {
            if (err.code === 'EEXIST') {
                console.error(chalk.red(`Check already exists, use --force to overwrite. '${fileName}'`));
                process.exit(1);
            }
            throw err;
        }

        return true;
    }


    /**
     * verifies all of the attributes are present for create but *does not*
     * validate the values of each attribute!!! (yet)
     * @arg {Boolean} existing false = more restrictive, ensures attributes which
     *                         could alter an *existing* check are not present.
     *                         Default: false
     * @returns {Boolean} whether the config is valid or not
     */
    verifyConfig(existing) {
        existing = typeof existing === 'undefined' ? false : existing; // eslint-disable-line no-param-reassign

        const requiredCheckAttributes = [
            'brokers',      // array, len > 0
            'config',       // object
            'display_name', // string
            'metrics',      // array, len > 0
            'notes',        // opt, string
            'period',       // int > 0
            'status',       // opt, "active"
            'tags',         // array
            'target',       // string
            'timeout',      // int > 0
            'type'          // for cosi (httptrap|json:nad|statsd)
        ];

        // optional because check creation will not fail if not present
        // but also because a default value will result in the property
        // not being returned from the API
        const optionalCheckAttributes = [
            'metric_limit'  // numeric
        ];

        const requiredMetricAttributes = [
            'name',         // string
            'type',         // /^(numeric|text)$/
            'status'        // /^(active|available)$/
        ];

        const requiredExistingCheckAttributes = [
            '_cid',
            '_check_uuids',
            '_checks',
            '_created',
            '_last_modified',
            '_last_modified_by',
            '_reverse_connection_urls'
        ];

        let errors = 0;

        for (const attr of requiredExistingCheckAttributes) {
            // an existing check (get/put/delete) *must* have these attributes
            if (existing && !{}.hasOwnProperty.call(this, attr)) {
                console.error(chalk.red('Missing attribute'), attr, 'required for', chalk.bold('existing'), 'check');
                errors += 1;
            }
            // a check to be created (post) must *not* have these attributes
            if (!existing && {}.hasOwnProperty.call(this, attr)) {
                console.error(chalk.red('Invalid attribute'), attr, 'for', chalk.bold('new'), 'check');
                errors += 1;
            }
        }

        for (const attr of requiredCheckAttributes) {
            if (!{}.hasOwnProperty.call(this, attr)) {
                console.error(chalk.red('Missing attribute'), attr);
                errors += 1;
            }
        }

        for (const attr of optionalCheckAttributes) {
            if (!{}.hasOwnProperty.call(this, attr)) {
                console.error(`Missing ${chalk.yellow('OPTIONAL')} attribute ${attr}, ignoring.`);
            }
        }

        for (const metric of this.metrics) {
            for (const attr of requiredMetricAttributes) {
                if (!{}.hasOwnProperty.call(metric, attr)) {
                    console.error(chalk.red('Missing attribute'), `metric '${metric}' requires '${attr}'`);
                    errors += 1;
                }
            }
        }

        return errors === 0;
    }

    /**
     * call api to create a check from current config
     * @arg {Function} cb callback
     * @returns {Undefined} nothing, uses callback
     */
    create(cb) {
        assert.strictEqual(typeof cb, 'function', 'cb must be a callback function');

        if (!this.verifyConfig(false)) {
            cb(new Error('Invalid configuration'));

            return;
        }

        api.setup(cosi.api_key, cosi.api_app, cosi.api_url);

        // for retrying on certain api errors
        let attempts = 0;
        const maxRetry = 5;
        const self = this;

        const apiRequest = () => {
            api.post('/check_bundle', this, (code, errAPI, result) => { // eslint-disable-line consistent-return
                if (errAPI) {
                    let retry = false;

                    if (errAPI === 'Could not update broker(s) with check') {
                        retry = true;
                    }

                    attempts += 1;

                    if (retry && attempts < maxRetry) {
                        console.warn(chalk.yellow('Retrying failed API call:'), errAPI, `- Broker's Group ID: ${self.brokers[0].replace('/broker/', '')}`, `attempt ${attempts}.`);
                        setTimeout(apiRequest, 1000 * attempts);

                        return;
                    }

                    const apiError = new Error();

                    apiError.code = 'CIRCONUS_API_ERROR';
                    apiError.message = errAPI;
                    apiError.details = result;

                    cb(apiError);

                    return;
                }

                if (code !== 200) {
                    const errResp = new Error();

                    errResp.code = code;
                    errResp.message = 'UNEXPECTED_API_RETURN';
                    errResp.details = result;

                    cb(errResp);

                    return;
                }

                self._init(result);

                cb(null, result);
            });
        };

        apiRequest();
    }


    /**
     * call api to update a dashboard from current config
     * @arg {Function} cb callback
     * @returns {Undefined} nothing, uses callback
     */
    update(cb) {
        assert.strictEqual(typeof cb, 'function', 'cb must be a callback function');

        if (!this.verifyConfig(true)) {
            cb(new Error('Invalid configuration'));

            return;
        }

        const self = this;

        api.setup(cosi.api_key, cosi.api_app, cosi.api_url);
        api.put(this._cid, this, (code, errAPI, result) => {
            if (errAPI) {
                cb(errAPI, result);

                return;
            }

            if (result === null) {
                console.log(code, errAPI, result);
                process.exit(1);
            }

            if (code !== 200) {
                const errResp = new Error();

                errResp.code = code;
                errResp.message = 'UNEXPECTED_API_RETURN';
                errResp.details = result;

                cb(errResp);

                return;
            }

            self._init(result);

            cb(null, result);
        });
    }


    /**
     * initializes the current object with values from a loaded configuration
     * @arg {Object} config loaded from file
     * @returns {undefined} nothing
     */
    _init(config) {
        const keys = Object.keys(config);

        for (let i = 0; i < keys.length; i++) {
            const key = keys[i];

            if ({}.hasOwnProperty.call(config, key)) {
                this[key] = config[key];
            }
        }
    }

};

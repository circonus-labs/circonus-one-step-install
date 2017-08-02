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
     * @returns {Promise} using api to create check
     */
    create() {
        const self = this;

        return new Promise((resolve, reject) => {
            if (!self.verifyConfig(false)) {
                reject(new Error('Invalid configuration'));

                return;
            }

            api.post('/check_bundle', self).
                then((res) => {
                    const parsed_body = res.parsed_body;
                    const code = res.code;
                    const raw_body = res.raw_body;

                    if (parsed_body === null) {
                        console.log(code, parsed_body, raw_body);
                        process.exit(1);
                    }

                    if (code !== 200) {
                        const err = new Error();

                        err.code = code;
                        err.message = 'UNEXPECTED_API_RETURN';
                        err.body = parsed_body;
                        err.raw_body = raw_body;

                        reject(err);

                        return;
                    }

                    self._init(parsed_body);

                    resolve(parsed_body);
                }).
                catch((err) => {
                    reject(err);
                });
        });
    }


    /**
     * call api to update a check from current config
     * @returns {Promise} using api to update check
     */
    update() {
        const self = this;

        return new Promise((resolve, reject) => {
            if (!self.verifyConfig(true)) {
                reject(new Error('Invalid configuration'));

                return;
            }

            api.put(self._cid, self).
                then((res) => {
                    const parsed_body = res.parsed_body;
                    const code = res.code;
                    const raw_body = res.raw_body;

                    if (parsed_body === null) {
                        console.log(code, parsed_body, raw_body);
                        process.exit(1);
                    }

                    if (code !== 200) {
                        const err = new Error();

                        err.code = code;
                        err.message = 'UNEXPECTED_API_RETURN';
                        err.body = parsed_body;
                        err.raw_body = raw_body;

                        reject(err);

                        return;
                    }

                    self._init(parsed_body);

                    resolve(parsed_body);
                }).
                catch((err) => {
                    reject(err);
                });
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

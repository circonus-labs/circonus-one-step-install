// Copyright 2016 Circonus, Inc. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const chalk = require('chalk');

const cosi = require(path.resolve(path.join(__dirname, '..')));
const api = require(path.resolve(cosi.lib_dir, 'api'));

module.exports = class Dashboard {

    /**
     * create dashboard object from config file
     * @arg {String} configFile to load (must be either a "config-" or "registration-")
     */
    constructor(configFile) {
        if (!configFile) {
            throw new Error('Missing Argument: configFile');
        }

        if (!configFile.match(/\/(config|registration)-dashboard-.*\.json/)) {
            throw new Error(`Invalid dashboard configuration/registration file '${configFile}'`);
        }

        const cfgFile = path.resolve(configFile);

        try {
            const config = require(cfgFile); // eslint-disable-line global-require

            this._init(config);
        } catch (err) {
            if (err.code === 'MODULE_NOT_FOUND') {
                console.error(chalk.red('ERROR - dashboard configuration file not found:'), cfgFile);
                process.exit(1);
            } else {
                throw err;
            }
        }
    }


    /**
     * save current config to file
     * @arg {String} configFile to save
     * @arg {Boolean} force overwrite if it exists
     * @returns {String} name of file saved, or throws an error on failure
     */
    save(configFile, force) {
        assert.strictEqual(typeof configFile, 'string', 'configFile is required');

        const cfgFile = path.resolve(configFile);

        try {
            fs.writeFileSync(
                cfgFile,
                JSON.stringify(this, null, 4), {
                    encoding : 'utf8',
                    flag     : force ? 'w' : 'wx',
                    mode     : 0o644
                });
        } catch (err) {
            // fs write errors are passed up (not handled, e.g. ENOENT, EEXIST, etc.)
            throw err;
        }

        return cfgFile;
    }


    /**
     * verifies all of the attributes are present for create but *does not*
     * validate the values of each attribute!!! (yet)
     * @arg {Boolean} existing false = more restrictive, ensures attributes which
     *                         could alter an *existing* dashboard are not present.
     *                         Default: false
     * @returns {Boolean} whether the config is valid or not
     */
    verifyConfig(existing) {
        existing = typeof existing === 'undefined' ? false : existing; // eslint-disable-line no-param-reassign

        const requiredAttributes = [
            'account_default',      // boolean
            'widgets',              // object of objects
            'grid_layout',          // object
            'shared',               // boolean
            'title'                 // string
        ];

        const requiredWidgetsAttributes = [
            'height',            // number
            'name',              // string
            'origin',            // string
            'settings',          // object
            'width'              // number
        ];

        // const requiredWidgetSettingsAttributes = [
        //     'account_id'        // number
        // ];

        const requiredExistingAttributes = [
            '_cid'              // string
        ];

        let errors = 0;

        for (const attr of requiredExistingAttributes) {
            if (existing && !{}.hasOwnProperty.call(this, attr)) {
                console.error(chalk.red('Missing attribute'), attr, 'required for', chalk.bold('existing'), 'dashboard');
                errors += 1;
            }

            if (!existing && {}.hasOwnProperty.call(this, attr)) {
                console.error(chalk.red('Invalid attribute'), attr, 'for', chalk.bold('new'), 'dashboard');
                errors += 1;
            }
        }

        for (const attr of requiredAttributes) {
            if (!{}.hasOwnProperty.call(this, attr)) {
                console.error(chalk.red('Missing attribute'), attr);
                errors += 1;
            }
        }

        for (let idx = 0; idx < this.widgets.length; idx++) {
            for (const attr of requiredWidgetsAttributes) {
                if (!{}.hasOwnProperty.call(this.widgets[idx], attr)) {
                    console.error(chalk.red('Missing attribute'), `widgets item #${idx}requires '${attr}'`);
                    errors += 1;
                }
            }
        }

        return errors === 0;
    }

    /**
     * call api to create a dashboard from current config
     * @returns {Object} promise
     */
    create() {
        return new Promise((resolve, reject) => {
            if (!this.verifyConfig(false)) {
                reject(new Error('Invalid configuration'));

                return;
            }

            api.post('/dashboard', this).
                then((res) => {
                    if (res.parsed_body === null || res.code !== 200) {
                        const err = new Error();

                        err.code = res.code;
                        err.message = 'UNEXPECTED_API_RETURN';
                        err.body = res.parsed_body;
                        err.raw_body = res.raw_body;

                        reject(err);

                        return;
                    }

                    this._init(res.parsed_body);

                    resolve(res.parsed_body);
                }).
                catch((err) => {
                    reject(err);
                });
        });
    }


    /**
     * call api to update a dashboard from current config
     * @returns {Object} promise
     */
    update() {
        return new Promise((resolve, reject) => {
            if (!this.verifyConfig(true)) {
                reject(new Error('Invalid configuration'));

                return;
            }

            api.put(this._cid, this).
                then((res) => {
                    if (res.parsed_body === null || res.code !== 200) {
                        const err = new Error();

                        err.code = res.code;
                        err.message = 'UNEXPECTED_API_RETURN';
                        err.body = res.parsed_body;
                        err.raw_body = res.raw_body;

                        reject(err);

                        return;
                    }

                    this._init(res.parsed_body);

                    resolve(res.parsed_body);
                }).
                catch((err) => {
                    reject(err);
                });
        });
    }

    /**
     * call api to delete a dashboard from current config
     * note the current config must contain a `_cid` attribute
     * @returns {Object} promise
     */
    remove() {
        return new Promise((resolve, reject) => {
            if (!{}.hasOwnProperty.call(this, '_cid')) {
                reject(new Error('Invalid dashboard config, no _cid attribute'));

                return;
            }

            api.get(this._cid, null).
                then((res) => {
                    if (res.code === 404 && (res.parsed_body.code && res.parsed_body.code === 'ObjectError.InstanceNotFound')) {
                        console.log(`\t${this._cid}`, chalk.bold('not found'));
                        resolve(null);

                        return false;
                    }

                    if (res.parsed_body === null || (res.code < 200 || res.code > 299)) {
                        const err = new Error();

                        err.code = res.code;
                        err.message = 'UNEXPECTED_API_RETURN';
                        err.body = res.parsed_body;
                        err.raw_body = res.raw_body;

                        reject(err);

                        return false;
                    }

                    return true;
                }).
                then((ok) => {
                    if (!ok) {
                        return;
                    }
                    console.log(chalk.bold('\tDeleting'), `Dashboard ${this._cid}`);

                    api.delete(this._cid).
                        then((result) => {
                            if (result.code < 200 || result.code > 299) {
                                const err = new Error();

                                err.code = result.code;
                                err.message = 'UNEXPECTED_API_RETURN';
                                err.body = result.parsed_body;
                                err.raw_body = result.raw_body;

                                reject(err);

                                return;
                            }
                            resolve(result.parsed_body);
                        }).
                        catch((err) => {
                            reject(err);
                        });
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

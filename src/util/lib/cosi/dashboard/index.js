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
     * @arg {Function} cb callback
     * @returns {Undefined} nothing, uses callback
     */
    create(cb) {
        assert.strictEqual(typeof cb, 'function', 'cb must be a callback function');

        if (!this.verifyConfig(false)) {
            cb(new Error('Invalid configuration'));

            return;
        }

        const self = this;

        api.setup(cosi.api_key, cosi.api_app, cosi.api_url);
        api.post('/dashboard', this, (code, errAPI, result) => {
            if (errAPI) {
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
     * call api to delete a dashboard from current config
     * note the current config must contain a `_cid` attribute
     * @arg {Function} cb callback
     * @returns {Undefined} nothing, uses callback
     */
    remove(cb) {
        assert.strictEqual(typeof cb, 'function', 'cb must be a callback function');

        const self = this;

        api.setup(cosi.api_key, cosi.api_app, cosi.api_url);

        api.get(self._cid, null, (getCode, getError, getResult) => {
            if (getCode === 404 && (getResult.code && getResult.code === 'ObjectError.InstanceNotFound')) {
                console.log(`\t${self._cid}`, chalk.bold('not found'));
                cb(null);

                return;
            }

            if (getCode < 200 || getCode > 299) {
                console.error(chalk.red('API RESULT CODE'), `API ${getCode}`, getError, getResult);
                cb(getError);

                return;
            }

            console.log(chalk.bold('\tDeleting'), `Dashboard ${self._cid}`);

            api.delete(self._cid, (code, errAPI, result) => {
                if (errAPI) {
                    cb(errAPI, result);

                    return;
                }

                if (code < 200 || code > 299) {
                    console.error(chalk.red('API RESULT CODE'), `API ${code}`, errAPI, result);
                    cb(`unexpected code: ${code}`, result);

                    return;
                }

                cb(null, result);
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

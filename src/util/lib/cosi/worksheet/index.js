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

module.exports = class Worksheet {

    /**
     * initialize a worksheet object
     * @arg {String} configFile for worksheet
     */
    constructor(configFile) {
        // configFile must be either a "config-" or "registration-"

        if (!configFile) {
            throw new Error('Missing Argument: configFile');
        }

        if (!configFile.match(/\/(config|registration)-worksheet-/)) {
            throw new Error(`Invalid worksheet configuration/registration file '${configFile}'`);
        }

        const cfgFile = path.resolve(configFile);

        try {
            const config = require(cfgFile); // eslint-disable-line global-require

            this._init(config);
        } catch (err) {
            if (err.code === 'MODULE_NOT_FOUND') {
                console.error(chalk.red('ERROR - worksheet configuration file not found:'), cfgFile);
                process.exit(1); // eslint-disable-line no-process-exit
            } else {
                throw err;
            }
        }
    }


    /**
     * save current worksheet object to a config file
     * @arg {String} configFile for worksheet
     * @arg {Boolean} force overwrite of existing file
     * @returns {String} config file name
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
     * verifies all attributes are present for create but *does not* validate the values of each attribute!!! (yet)
     * @arg {Boolean} existing stricter validation
     * @returns {Boolean} whether config is valid
     */
    verifyConfig(existing) {
        // default existing to false, most restrictive verify
        // (ensures attributes which could alter an *existing* worksheet are not present)
        existing = typeof existing === 'undefined' ? false : existing; // eslint-disable-line no-param-reassign

        const requiredAttributes = [
            'description',          // string
            'favorite',             // boolean
            'notes',                // string
            'tags',                 // array (of strings)
            'title'                 // string
        ];

        // note - at least ONE of these is required to make the worksheet valid
        const optionalAttributes = [
            'graphs',           // array (of objects)
            'smart_queries'     // array (of objects)
        ];

        const requiredGraphsAttributes = [
            'graph'             // string (graph cid)
        ];

        const requiredSmartQueriesAttributes = [
            'name',             // string
            'order',            // array (of string - graph cids)
            'query'             // string
        ];

        const requiredExistingAttributes = [
            '_cid'              // string
        ];

        let errors = 0;

        // for (const attr of requiredExistingAttributes) {
        for (let i = 0; i < requiredExistingAttributes.length; i++) {
            const attr = requiredExistingAttributes[i];

            if (existing && !{}.hasOwnProperty.call(this, attr)) {
                console.error(chalk.red('Missing attribute'), attr, 'required for', chalk.bold('existing'), 'worksheet');
                errors += 1;
            }

            if (!existing && {}.hasOwnProperty.call(this, attr)) {
                console.error(chalk.red('Invalid attribute'), attr, 'for', chalk.bold('new'), 'worksheet');
                errors += 1;
            }
        }

        for (const attr of requiredAttributes) {
            if (!{}.hasOwnProperty.call(this, attr)) {
                console.error(chalk.red('Missing attribute'), attr);
                errors += 1;
            }
        }

        let hasOne = false;

        for (const attr of optionalAttributes) {
            if ({}.hasOwnProperty.call(this, attr)) {
                if (Array.isArray(this[attr]) && this[attr].length > 0) {
                    hasOne = true;
                }
            } else {
                console.error(`Missing ${chalk.yellow('OPTIONAL')} attribute ${attr}, ignoring.`);
            }
        }

        if (!hasOne) {
            console.error(chalk.red('ERROR'), "One of 'graphs' or 'smart_queries' is requried.");
            errors += 1;
        }

        if ({}.hasOwnProperty.call(this, 'graphs')) {
            for (let idx = 0; idx < this.graphs.length; idx++) {
                for (const attr of requiredGraphsAttributes) {
                    if (!{}.hasOwnProperty.call(this.graphs[idx], attr)) {
                        console.error(chalk.red('Missing attribute'), `graphs item #${idx}requires '${attr}'`);
                        errors += 1;
                    }
                }
            }
        }

        if ({}.hasOwnProperty.call(this, 'smart_queries')) {
            for (const query of this.smart_queries) {
                for (const attr of requiredSmartQueriesAttributes) {
                    if (!{}.hasOwnProperty.call(query, attr)) {
                        console.error(chalk.red('Missing attribute'), `smart query '${query.name || query.query}' requires '${attr}'`);
                        errors += 1;
                    }
                }
            }
        }

        return errors === 0;
    }

    /**
     * call api to create a worksheet
     * @arg {Function} cb callback
     * @returns {undefined} nothing
     */
    create(cb) {
        assert.strictEqual(typeof cb, 'function', 'cb must be a callback function');

        if (!this.verifyConfig(false)) {
            cb(new Error('Invalid configuration'));

            return;
        }

        const self = this;

        api.setup(cosi.api_key, cosi.api_app, cosi.api_url);
        api.post('/worksheet', this, (code, errAPI, result) => {
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
     * call api to update a worksheet
     * @arg {Function} cb callback
     * @returns {undefined} nothing
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
     * initializes the current object with values from a loaded configuration
     * @arg {Object} config loaded or retrieved from api
     * @returns {undefined} nothing
     */
    _init(config) {
        for (const key of Object.keys(config)) {
            if ({}.hasOwnProperty.call(config, key)) {
                this[key] = config[key];
            }
        }
    }

};

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

/*
cosi_dir/rulesets/*.json (/opt/circonus/cosi/rulesets/*.json)

template-ruleset.json - a ruleset configuration with the default fields blank.
                        can be used to copy and edit locally. it will
                        be skipped when processing the directory.

set "check" field to one of:
    null: will use cosi check id "check-system"
    cosi check id: will use cid from check registration (e.g. "check-system", "check-statsd")
    explicit check id: a valid circonus check cid (/^\/check\/[0-9]+$/)

a rulset configuration which has been successfully created via the API will
appear in the directory with a "-cosi" suffix added to the original file
name. (e.g. original "high-cpu.json", created "high-cpu-cosi.json".)

for more information on ruleset configurations, see:
    [configuring rulesets](https://login.circonus.com/user/docs/Alerting/Rules/Configure)
    [rule_set api endpoint](https://login.circonus.com/resources/api/calls/rule_set)

*/

module.exports = class RuleSet {

    /**
     * initialize new ruleset object
     * @arg {String} configFile to load
     */
    constructor(configFile) {
        assert.strictEqual(typeof configFile, 'string', 'configFile is required');

        if (!configFile) {
            throw new Error('Missing Argument: configFile');
        }

        const cfgFile = path.resolve(configFile);

        try {
            const cfg = require(cfgFile); // eslint-disable-line global-require

            this._init(cfg);
        } catch (err) {
            if (err.code === 'MODULE_NOT_FOUND') {
                console.error(chalk.red('ERROR - ruleset configuration file not found:'), cfgFile);
                process.exit(1);
            } else {
                throw err;
            }
        }
    }

    /**
     * verify configuration
     * @arg {Boolean} existing default to false, most restrictive verify. (ensures attributes which could alter an *existing* check are not present)
     * @returns {Boolean} verified
     */
    verifyConfig(existing) {
        existing = typeof existing === 'undefined' ? false : existing; // eslint-disable-line no-param-reassign

        const requiredAttributes = [
            'check',            // string, /^\/check\/[0-9]+$/
            'contact_groups',   // array ["1": [strings], "2": [strings], ... "5": [strings]]
            'derive',           // string or null
            'link',             // url
            'metric_name',      // string
            'metric_type',      // string ^(numeric|text)$
            'notes',            // string
            'parent',           // string /^[0-9]+\_[a-z0-9]+$/
            'rules'             // array of object
        ];

        const requiredRuleAttributes = [
            'criteria',             // string
            'severity',             // number
            'value',                // string
            'wait',                 // number
            'windowing_duration',   // string, type or null
            'windowing_function'    // string, type or null
        ];

        const requiredExistingAttributes = [
            '_cid'
        ];

        let errors = 0;

        for (let i = 0; i < requiredExistingAttributes.length; i++) {
            const attr = requiredExistingAttributes[i];

            if (existing && !this.hasOwnProperty(attr)) { // eslint-disable-line no-prototype-builtins
                console.error(chalk.red('Missing attribute'), attr, 'required for', chalk.bold('existing'), 'rule');
                errors += 1;
            }

            if (!existing && this.hasOwnProperty(attr)) { // eslint-disable-line no-prototype-builtins
                console.error(chalk.red('Invalid attribute'), attr, 'for', chalk.bold('new'), 'rule');
                errors += 1;
            }
        }

        for (let i = 0; i < requiredAttributes.length; i++) {
            const attr = requiredAttributes[i];

            if (!this.hasOwnProperty(attr)) { // eslint-disable-line no-prototype-builtins
                console.error(chalk.red('Missing attribute'), attr);
                errors += 1;
            }
        }

        for (let ruleIdx = 0; ruleIdx < this.rules.length; ruleIdx++) {
            const rule = this.rules[ruleIdx];

            for (let i = 0; i < requiredRuleAttributes.length; i++) {
                const attr = requiredRuleAttributes[i];

                if (!{}.hasOwnProperty.call(rule, attr)) {
                    console.error(chalk.red('Missing attribute'), `rule #${ruleIdx} requires '${attr}'`);
                    errors += 1;
                }
            }
        }

        return errors === 0;
    }

    /**
     * create a new ruleset
     * @arg {Function} cb callback
     * @returns {Undefined} nothing
     */
    create(cb) {
        assert.strictEqual(typeof cb, 'function', 'cb must be a callback function');

        if (!this.verifyConfig(false)) {
            cb(new Error('Invalid configuration'));

            return;
        }

        const self = this;

        api.setup(cosi.api_key, cosi.api_app, cosi.api_url);
        api.post('/rule_set', this, (code, errAPI, result) => {
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
     * update an existing ruleset
     * @arg {Function} cb callback
     * @returns {Undefined} nothing
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
     * delete an existing ruleset
     * @arg {Function} cb callback
     * @returns {Undefined} nothing
     */
    delete(cb) {
        assert.strictEqual(typeof cb, 'function', 'cb must be a callback function');

        if (!this.verifyConfig(true)) {
            cb(new Error('Invalid configuration'));

            return;
        }

        api.setup(cosi.api_key, cosi.api_app, cosi.api_url);
        api.delete(this._cid, (code, errAPI, result) => {
            if (errAPI) {
                cb(errAPI, result);

                return;
            }

            if (code !== 204) {
                const errResp = new Error();

                errResp.code = code;
                errResp.message = 'UNEXPECTED_API_RETURN';
                if (result !== null) {
                    errResp.details = result;
                }

                cb(errResp);

                return;
            }

            cb(null, true);
        });
    }

    /**
     * save current ruleset config
     * @arg {String} fileName to save to
     * @arg {Boolean} force overwrite
     * @returns {Undefined} nothing
     */
    save(fileName, force) {
        assert.strictEqual(typeof fileName, 'string', 'fileName is required');
        force = force || false;  // eslint-disable-line no-param-reassign

        const options = {
            encoding : 'utf8',
            flag     : force ? 'w' : 'wx',
            mode     : 0o640
        };

        try {
            fs.writeFileSync(fileName, JSON.stringify(this, null, 4), options);
        } catch (err) {
            if (err.code === 'EEXIST') {
                console.error(chalk.red(`Rule set already exists, use --force to overwrite. '${fileName}'`));
                process.exit(1);
            }
            throw err;
        }

        return true;
    }

    /**
     * get check id from a check registration
     * @arg {String} checkId to retrieve
     * @returns {String} check id or null
     */
    _getCheckId(checkId) {  // eslint-disable-line class-methods-use-this
        const regFile = path.resolve(path.join(cosi.reg_dir, `registration-${checkId}.json`));

        try {
            const check = require(regFile); // eslint-disable-line global-require

            if ({}.hasOwnProperty.call(check, '_checks')) {
                if (Array.isArray(check._checks) && check._checks.length > 0) {
                    return check._checks[0];
                }
            }
        } catch (err) {
            console.error(chalk.yellow('WARN'), 'unable to find check ID', checkId, 'for ruleset.', err);
        }

        return null;
    }


    /**
     * initialize object with values from loaded config
     * @arg {String} config to use
     * @returns {Undefined} nothing
     */
    _init(config) {
        const keys = Object.keys(config);

        if ({}.hasOwnProperty.call(config, 'check')) {
            if (config.check === null) {
                config.check = 'check-system'; // eslint-disable-line no-param-reassign
            }

            if ((/^check-[a-z]+$/).test(config.check)) {
                config.check = this._getCheckId(config.check); // eslint-disable-line no-param-reassign
            }
        }

        for (const key of keys) {
            if ({}.hasOwnProperty.call(config, key)) {
                this[key] = config[key];
            }
        }
    }

};

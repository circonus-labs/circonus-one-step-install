// Copyright 2016 Circonus, Inc. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const chalk = require('chalk');

const cosi = require(path.resolve(path.resolve(__dirname, '..', '..', '..', 'cosi')));
const Registration = require(path.resolve(cosi.lib_dir, 'registration'));
const Template = require(path.join(cosi.lib_dir, 'template'));
const Worksheet = require(path.resolve(cosi.lib_dir, 'worksheet'));
const api = require(path.resolve(cosi.lib_dir, 'api'));

class Worksheets extends Registration {

    /**
     * create worksheet object
     * @arg {Boolean} quiet squelch some info messages
     */
    constructor(quiet) {
        super(quiet);

        const err = this.loadRegConfig();

        if (err !== null) {
            this.emit('error', err);
        }
    }

    /**
     * create a new worksheet
     * @arg {Function} cb callback
     * @returns {Undefined} nothing, uses callback
     */
    create(cb) {
        console.log(chalk.bold('\nRegistration - worksheets'));

        const self = this;

        this.once('worksheets.config', this.configWorksheets);
        this.once('worksheets.config.done', () => {
            self.emit('worksheets.create');
        });

        this.once('worksheets.create', this.createWorksheets);
        this.once('worksheets.create.done', () => {
            self.emit('worksheets.finalize');
        });

        this.once('worksheets.finalize', () => {
            // noop at this point
            self.emit('worksheets.done');
        });

        this.once('worksheets.done', () => {
            if (typeof cb === 'function') {
                cb(); // eslint-disable-line callback-return
            }
        });

        this.emit('worksheets.config');
    }

    /**
     * configure worksheet
     * @returns {Undefined} nothing
     */
    configWorksheets() {
        console.log(chalk.blue(this.marker));
        console.log(`Configuring Worksheets`);

        const id = 'worksheet-system';
        const configFile = path.resolve(cosi.reg_dir, `config-${id}.json`);
        const templateFile = configFile.replace('config-', 'template-');

        if (this._fileExists(configFile)) {
            console.log(chalk.bold('\tConfiguration exists'), configFile);
            this.emit('worksheets.config.done');

            return;
        }

        const template = new Template(templateFile);
        const config = template.config;

        config.smart_queries = [
            {
                name  : 'Circonus One Step Install',
                order : [],
                query : `(notes:"${this.regConfig.cosiNotes}*")`
            }
        ];

        config.notes = this.regConfig.cosiNotes;
        this._setTags(config, id);
        this._setCustomWorksheetOptions(config, id);

        try {
            fs.writeFileSync(configFile, JSON.stringify(config, null, 4), {
                encoding : 'utf8',
                flag     : 'w',
                mode     : 0o644
            });
        } catch (err) {
            this.emit('error', err);

            return;
        }

        console.log('\tSaved configuration', configFile);
        this.emit('worksheets.config.done');
    }


    /**
     * create worksheet
     * @returns {Undefined} nothing
     */
    createWorksheets() {
        console.log(chalk.blue(this.marker));
        console.log('Creating Worksheets');

        const self = this;
        const regFile = path.resolve(cosi.reg_dir, 'registration-worksheet-system.json');
        const cfgFile = regFile.replace('registration-', 'config-');

        if (this._fileExists(regFile)) {
            console.log(chalk.bold('\tRegistration exists'), regFile);
            this.emit('worksheets.create.done');

            return;
        }

        if (!this._fileExists(cfgFile)) {
            this.emit('error', new Error(`Missing worksheet configuration file '${cfgFile}'`));

            return;
        }

        const worksheet = new Worksheet(cfgFile);

        if (worksheet.verifyConfig()) {
            console.log('\tValid worksheet config');
        }

        this._findWorksheet(worksheet.title, (findErr, regConfig) => {
            if (findErr !== null) {
                self.emit('error', findErr);

                return;
            }

            if (regConfig !== null) {
                console.log(`\tSaving registration ${regFile}`);
                try {
                    fs.writeFileSync(regFile, JSON.stringify(regConfig, null, 4), {
                        encoding : 'utf8',
                        flag     : 'w',
                        mode     : 0o644
                    });
                } catch (saveErr) {
                    self.emit('error', saveErr);

                    return;
                }

                console.log(
                    chalk.green('\tWorksheet:'),
                    `${self.regConfig.account.ui_url}/trending/worksheets/${regConfig._cid.replace('/worksheet/', '')}`);
                self.emit('worksheets.create.done');

                return;
            }

            console.log('\tSending worksheet configuration to Circonus API');

            worksheet.create((err) => {
                if (err) {
                    self.emit('error', err);

                    return;
                }

                console.log(`\tSaving registration ${regFile}`);
                worksheet.save(regFile, true);

                console.log(
                    chalk.green('\tWorksheet created:'),
                    `${self.regConfig.account.ui_url}/trending/worksheets/${worksheet._cid.replace('/worksheet/', '')}`);
                self.emit('worksheets.create.done');
            });
        });
    }

    /**
     * find a specific worksheet
     * @arg {String} title of worksheet
     * @arg {Function} cb callback
     * @returns {Undefined} nothing, uses callback
     */
    _findWorksheet(title, cb) { // eslint-disable-line class-methods-use-this
        if (title === null) {
            cb(new Error('Invalid worksheet title'));

            return;
        }

        console.log(`\tChecking API for existing worksheet with title '${title}'`);

        api.setup(cosi.api_key, cosi.api_app, cosi.api_url);
        api.get('/worksheet', { f_title: title }, (code, errAPI, result) => {
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

            if (Array.isArray(result) && result.length > 0) {
                console.log(chalk.green('\tFound'), `${result.length} existing worksheet(s) with title '${title}'`);
                cb(null, result[0]);

                return;
            }

            cb(null, null);
        });
    }


    /*

    Utility methods

    */

    /**
     * configure custom worksheet options
     * @arg {Object} cfg the worksheet configuration
     * @arg {String} id the worksheet id (used to identify custom options)
     * @returns {Undefined} nothing
     */
    _setCustomWorksheetOptions(cfg, id) {
        assert.equal(typeof cfg, 'object', 'cfg is required');
        assert.equal(typeof id, 'string', 'id is required');

        console.log('\tApplying custom config options and interpolating templates');

        const idParts = id.split('-', 2);
        const options = [
            'description',
            'title'
        ];

        if (idParts.length === 2) {
            const cfgType = idParts[0];
            const cfgId = idParts[1];

            if ({}.hasOwnProperty.call(cosi.custom_options, cfgType)) {
                const custom = cosi.custom_options[cfgType];

                for (const opt of options) {
                    if ({}.hasOwnProperty.call(custom, opt)) {
                        console.log(`\tSetting ${opt} to ${custom[opt]}`);
                        cfg[opt] = custom[opt]; // eslint-disable-line no-param-reassign
                    }
                }

                if ({}.hasOwnProperty.call(custom, cfgId)) {
                    for (const opt of options) {
                        if ({}.hasOwnProperty.call(custom[cfgId], opt)) { // eslint-disable-line max-depth
                            console.log(`\tSetting ${opt} to ${custom[cfgId][opt]}`);
                            cfg[opt] = custom[cfgId][opt]; // eslint-disable-line no-param-reassign
                        }
                    }
                }
            }
        }

        const data = this._mergeData(id);

        for (const opt of options) {
            console.log(`\tInterpolating ${opt} ${cfg[opt]}`);
            cfg[opt] = this._expand(cfg[opt], data); // eslint-disable-line no-param-reassign
        }

        // expand tags
        for (let i = 0; i < cfg.tags.length; i++) {
            if (cfg.tags[i].indexOf('{{') !== -1) {
                console.log(`\tInterpolating tag ${cfg.tags[i]}`);
                cfg.tags[i] = this._expand(cfg.tags[i], data); // eslint-disable-line no-param-reassign
            }
        }
    }

    /**
     * placeholder, noop
     * @returns {Undefined} nothing
     */
    finalizeWorksheets() { // eslint-disable-line class-methods-use-this, no-empty-function

    }

}

module.exports = Worksheets;

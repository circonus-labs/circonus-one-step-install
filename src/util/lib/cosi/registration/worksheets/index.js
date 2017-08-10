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
     * @returns {Object} promise
     */
    create() {
        return new Promise((resolve, reject) => {
            console.log(chalk.bold('\nRegistration - worksheets'));

            this.configWorksheets().
                then(() => {
                    return this.createWorksheets();
                }).
                then(() => {
                    return this.finalizeWorksheets();
                }).
                then(() => {
                    resolve();
                }).
                catch((err) => {
                    reject(err);
                });
        });
    }

    /**
     * configure worksheet
     * @returns {Object} promise
     */
    configWorksheets() {
        return new Promise((resolve, reject) => {
            console.log(chalk.blue(this.marker));
            console.log(`Configuring Worksheets`);

            const id = 'worksheet-system';
            const configFile = path.resolve(cosi.reg_dir, `config-${id}.json`);
            const templateFile = configFile.replace('config-', 'template-');

            if (this._fileExists(configFile)) {
                console.log(chalk.bold('\tConfiguration exists'), configFile);
                resolve();

                return;
            }

            const template = new Template(templateFile);
            const config = template.config;

            config.smart_queries = [ {
                name  : 'Circonus One Step Install',
                order : [],
                query : `(notes:"${this.regConfig.cosiNotes}*")`
            } ];

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
                reject(err);

                return;
            }

            console.log('\tSaved configuration', configFile);
            resolve();
        });
    }


    /**
     * create worksheet
     * @returns {Object} promise
     */
    createWorksheets() {
        return new Promise((resolve, reject) => {
            console.log(chalk.blue(this.marker));
            console.log('Creating Worksheets');

            const regFile = path.resolve(cosi.reg_dir, 'registration-worksheet-system.json');
            const cfgFile = regFile.replace('registration-', 'config-');

            if (this._fileExists(regFile)) {
                console.log(chalk.bold('\tRegistration exists'), regFile);
                resolve();

                return;
            }

            if (!this._fileExists(cfgFile)) {
                reject(new Error(`Missing worksheet configuration file '${cfgFile}'`));

                return;
            }

            const worksheet = new Worksheet(cfgFile);

            if (worksheet.verifyConfig()) {
                console.log('\tValid worksheet config');
            }

            this._findWorksheet(worksheet.title).
                then((regConfig) => {
                    if (regConfig === null) {
                        console.log('\tSending worksheet configuration to Circonus API');

                        return worksheet.create();
                    }

                    console.log(`\tWorksheet found via API, saving registration ${regFile}`);
                    try {
                        fs.writeFileSync(regFile, JSON.stringify(regConfig, null, 4), {
                            encoding : 'utf8',
                            flag     : 'w',
                            mode     : 0o644
                        });
                    } catch (errSave) {
                        reject(errSave);

                        return null;
                    }

                    console.log(
                        chalk.green('\tWorksheet:'),
                        `${this.regConfig.account.ui_url}/trending/worksheets/${regConfig._cid.replace('/worksheet/', '')}`);

                    return null;
                }).
                then((cfg) => {
                    if (cfg !== null) {
                        console.log(`\tSaving registration ${regFile}`);
                        worksheet.save(regFile, true);

                        console.log(
                            chalk.green('\tWorksheet created:'),
                            `${this.regConfig.account.ui_url}/trending/worksheets/${worksheet._cid.replace('/worksheet/', '')}`);
                    }
                    resolve();
                }).
                catch((err) => {
                    reject(err);
                });
        });
    }

    /**
     * finalize worksheet(s)
     * @returns {Object} promise
     */
    finalizeWorksheets() { // eslint-disable-line class-methods-use-this
         // NOP for now
        return Promise.resolve();
    }

    /**
     * find a specific worksheet
     * @arg {String} title of worksheet
     * @returns {Object} promise
     */
    _findWorksheet(title) { // eslint-disable-line class-methods-use-this
        return new Promise((resolve, reject) => {
            if (title === null) {
                reject(new Error('Invalid worksheet title'));

                return;
            }
            console.log(`\tChecking API for existing worksheet with title '${title}'`);

            api.get('/worksheet', { f_title: title }).
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

                    if (Array.isArray(res.parsed_body) && res.parsed_body.length > 0) {
                        console.log(chalk.green('\tFound'), `${res.parsed_body.length} existing worksheet(s) with title '${title}'`);
                        resolve(res.parsed_body[0]);

                        return;
                    }

                    resolve(null);
                }).
                catch((err) => {
                    reject(err);
                });
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

}

module.exports = Worksheets;

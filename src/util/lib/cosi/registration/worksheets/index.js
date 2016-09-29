'use strict';

/* eslint-env node, es6 */

/* eslint-disable global-require */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const chalk = require('chalk');

const cosi = require(path.resolve(path.resolve(__dirname, '..', '..', '..', 'cosi')));
const Registration = require(path.resolve(cosi.lib_dir, 'registration'));
const Template = require(path.join(cosi.lib_dir, 'template'));
const Worksheet = require(path.resolve(cosi.lib_dir, 'worksheet'));

class Worksheets extends Registration {

    constructor(quiet) {
        super(quiet);

        const err = this.loadRegConfig();

        if (err !== null) {
            this.emit('error', err);
            return;
        }
    }

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
                cb();
                return;
            }
        });

        this.emit('worksheets.config');
    }

    configWorksheets() {
        console.log(chalk.blue(this.marker));
        console.log(`Configuring Worksheets`);

        const id = 'worksheet-system';
        const configFile = path.resolve(cosi.reg_dir, `config-${id}.json`);
        const templateFile = configFile.replace('config-', 'template-');

        if (this._fileExists(configFile)) {
            console.log('\tWorksheet configuration already exists', configFile);
            this.emit('worksheets.config.done');
            return;
        }

        const template = new Template(templateFile);
        const config = template.config;

        config.smart_queries = [
            {
                name: 'Circonus One Step Install',
                order: [],
                query: `(notes:"${this.regConfig.cosiNotes}*")`
            }
        ];

        config.notes = this.regConfig.cosiNotes;
        this._setTags(config, id);
        this._setCustomWorksheetOptions(config, id);

        try {
            fs.writeFileSync(configFile, JSON.stringify(config, null, 4), { encoding: 'utf8', mode: 0o644, flag: 'w' });
        } catch (err) {
            this.emit('error', err);
            return;
        }

        console.log('\tSaved configuration', configFile);
        this.emit('worksheets.config.done');

    }


    createWorksheets() {
        console.log(chalk.blue(this.marker));
        console.log('Creating Worksheets');

        const self = this;
        const regFile = path.resolve(cosi.reg_dir, 'registration-worksheet-system.json');
        const cfgFile = regFile.replace('registration-', 'config-');

        if (this._fileExists(regFile)) {
            console.log(chalk.bold('\tRegistration exists'), `using ${regFile}`);
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
    }


    /*

    Utility methods

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

                for (let i = 0; i < options.length; i++) {
                    const opt = options[i];

                    if ({}.hasOwnProperty.call(custom, opt)) {
                        console.log(`\tSetting ${opt} to ${custom[opt]}`);
                        cfg[opt] = custom[opt]; // eslint-disable-line no-param-reassign
                    }
                }

                if ({}.hasOwnProperty.call(custom, cfgId)) {
                    for (let i = 0; i < options.length; i++) {
                        const opt = options[i];

                        if ({}.hasOwnProperty.call(custom[cfgId], opt)) {
                            console.log(`\tSetting ${opt} to ${custom[cfgId][opt]}`);
                            cfg[opt] = custom[cfgId][opt]; // eslint-disable-line no-param-reassign
                        }
                    }
                }
            }
        }

        const data = this._mergeData(id);

        for (let i = 0; i < options.length; i++) {
            const opt = options[i];

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

    finalizeWorksheets() {

    }

}

module.exports = Worksheets;

// Copyright 2016 Circonus, Inc. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const url = require('url');

const chalk = require('chalk');

const cosi = require(path.resolve(path.resolve(__dirname, '..', '..', '..', 'cosi')));
const Registration = require(path.resolve(cosi.lib_dir, 'registration'));
const Template = require(path.join(cosi.lib_dir, 'template'));
const Check = require(path.resolve(cosi.lib_dir, 'check'));

class Checks extends Registration {

    /**
     * create dashboard object
     * @arg {Boolean} quiet squelch some info messages
     */
    constructor(quiet) {
        super(quiet);

        const err = this.loadRegConfig();

        if (err !== null) {
            this.emit('error', err);

            return;
        }

        this.checks = {
            group  : null,
            system : null
        };
    }

    /**
     * start the check creation process
     * @returns {Object} promise
     */
    create() {
        return new Promise((resolve, reject) => {
            console.log(chalk.bold('\nRegistration - checks'));

            this.configSystemCheck().
                then(() => {
                    return this.createSystemCheck();
                }).
                then((check) => {
                    this._setCheckMeta('system', check);

                    return this.finalizeSystemCheck();
                }).
                then(() => {
                    if (!this.regConfig.group.enabled) {
                        resolve();

                        return null;
                    }

                    return this.configGroupCheck();
                }).
                then(() => {
                    if (!this.regConfig.group.enabled) {
                        return null;
                    }

                    return this.createGroupCheck();
                }).
                then((check) => {
                    if (!this.regConfig.group.enabled) {
                        return null;
                    }
                    if (check === null) {
                        this.emit('error', new Error('null group check'));

                        return null;
                    }

                    this._setCheckMeta('group', check);

                    return this.finalizeGroupCheck();
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
     * update a check
     * @returns {Object} promise
     */
    update() { // eslint-disable-line max-statements
        const self = this;

        return new Promise((resolve, reject) => {
            console.log(chalk.blue(this.marker));
            console.log('Updating system check');

            const regFile = path.resolve(cosi.reg_dir, 'registration-check-system.json');

            if (!self._fileExists(regFile)) {
                reject(new Error(`System check registration file not found ${regFile}`));

                return;
            }

            console.log(chalk.bold('\tRegistration found'), `using ${regFile}`);

            const check = new Check(regFile);
            const checkMetrics = check.metrics;
            const visualMetrics = self._extractMetricsFromVisuals();
            let updateCheck = false;

            console.log(chalk.bold('\tChecking metrics'), 'from visuals against currently active metrics');
            for (let i = 0; i < visualMetrics.length; i++) {
                let active = false;

                for (let j = 0; j < checkMetrics.length; j++) {
                    if (checkMetrics[j].name === visualMetrics[i].name) {
                        active = true;
                        break;
                    }
                }
                if (!active) {
                    console.log(chalk.bold('\t\tFound'), `new metric ${visualMetrics[i].name}`);
                    updateCheck = true;
                    // not breaking on first new metric, so we have a list in log of all new metrics
                }
            }

            if (updateCheck) {
                check.metrics = visualMetrics;
            }

            // check for new metric tags
            const metricTagFile = path.resolve(path.join(cosi.reg_dir, 'metric-tags.json'));

            if (this._fileExists(metricTagFile)) {
                let metricTags = {};

                try {
                    metricTags = require(metricTagFile); // eslint-disable-line global-require
                } catch (ignoreErr) {
                    // ignore
                }

                console.log(chalk.bold('\tChecking metric tags'), `from ${metricTagFile}`);

                for (let i = 0; i < check.metrics.length; i++) {
                    const metricName = check.metrics[i].name;

                    if (!Array.isArray(check.metrics[i].tags)) {
                        check.metrics[i].tags = [];
                    }

                    if ({}.hasOwnProperty.call(metricTags, metricName)) {
                        const currTags = check.metrics[i].tags.join(',');

                        for (let j = 0; j < metricTags[metricName].length; j++) {
                            const tag = metricTags[metricName][j];

                            if (currTags.indexOf(tag) === -1) { // eslint-disable-line max-depth
                                console.log('\t\tFound', `new tag for ${metricName}, adding ${tag}`);
                                check.metrics[i].tags.push(tag);
                                updateCheck = true;
                            }
                        }
                    }
                }
            }

            if (!updateCheck) {
                console.log(chalk.green('\tSKIPPING'), 'check update, no new metrics or metric tags found');
                resolve();

                return;
            }

            console.log(chalk.bold(`\tUpdating system check`), 'new metrics found');
            if (!{}.hasOwnProperty.call(check, 'metric_limit')) {
                check.metric_limit = 0;
            }
            check.update().
                then((result) => {
                    try {
                        fs.writeFileSync(regFile, JSON.stringify(result, null, 4), {
                            encoding : 'utf8',
                            flag     : 'w',
                            mode     : 0o644
                        });
                    } catch (errSave) {
                        reject(errSave);

                        return;
                    }
                    console.log(chalk.green('\tSaved'), `updated registration to file ${regFile}`);
                    resolve();
                }).
                catch((err) => {
                    reject(err);
                });
        });
    }

    /**
     * extract metrics from graphs/dashboards/etc. (for activation in check)
     * @returns {Undefined} nothing
     */
    _extractMetricsFromVisuals() { // eslint-disable-line class-methods-use-this
        const activeMetrics = [];

        console.log(chalk.bold('\tCollecting required metrics from registered visuals'));

        const files = fs.readdirSync(cosi.reg_dir);

        for (const file of files) {
            if (file.match(/^registration-graph-.*\.json$/)) {
                const configFile = path.resolve(path.join(cosi.reg_dir, file));
                let graph = null;

                console.log(`\tLoading required metrics from ${configFile}`);

                try {
                    graph = require(configFile); // eslint-disable-line global-require
                } catch (err) {
                    console.log(chalk.yellow('\tWARN'), `Unable to load ${configFile} ${err}, skipping`);
                    continue;
                }

                for (const dp of graph.datapoints) {
                    // a caql statement, not creating a caql parser here...
                    // to enable metrics which are *only* used in a caql statement
                    // add the metric to the graph as a regular datapoint and
                    // set hidden attribute to true
                    if (dp.metric_name === null && dp.caql !== null) {
                        console.log('\t\tIgnoring C:AQL statement:', dp.caql);
                        continue;
                    }

                    console.log('\t\tAdding required metric:', dp.metric_name);
                    activeMetrics.push({
                        name   : dp.metric_name,
                        status : 'active',
                        type   : dp.metric_type
                    });
                }
            } else if (file.match(/^registration-dashboard-.*\.json$/)) {
                const configFile = path.resolve(path.join(cosi.reg_dir, file));
                let dashboard = null;

                console.log(`\tLoading required metrics from ${configFile}`);

                try {
                    dashboard = require(configFile); // eslint-disable-line global-require
                } catch (err) {
                    console.log(chalk.yellow('\tWARN'), `Unable to load ${configFile} ${err}, skipping`);
                    continue;
                }

                for (const widget of dashboard.widgets) {
                    if (widget.type !== 'gauge') {
                        continue;
                    }

                    console.log('\t\tAdding required metric:', widget.settings.metric_name);
                    activeMetrics.push({
                        name   : widget.settings.metric_name,
                        // no way to determine if the metric should
                        // be a histogram based on use in dashboard.
                        // may need to add metric_type to gauge widget
                        // settings as is in graph datapoints.
                        status : 'active',
                        type   : widget.settings._type === 'text' ? 'text' : 'numeric'
                    });
                }
            }
        }

        return activeMetrics;
    }

    /**
     * Load check meta data from existing registrations if they exists
     * @returns {Object} a copy of the checks w/meta data
     */
    getMeta() {
        if (this.checks.system === null) {
            const regFile = path.resolve(path.join(cosi.reg_dir, 'registration-check-system.json'));

            if (!this._fileExists(regFile)) {
                this.emit('error', new Error('System check registration file not found'));

                return null;
            }
            try {
                const check = require(regFile); // eslint-disable-line global-require

                this._setCheckMeta('system', check);
            } catch (err) {
                this.emit('error', err);

                return null;
            }
        }

        if (this.checks.group === null && this.regConfig.group.enabled) {
            const regFile = path.resolve(path.join(cosi.reg_dir, 'registration-check-group.json'));

            if (!this._fileExists(regFile)) {
                this.emit('error', new Error('Group check registration file not found'));

                return null;
            }
            try {
                const check = require(regFile); // eslint-disable-line global-require

                this._setCheckMeta('group', check);
            } catch (err) {
                this.emit('error', err);

                return null;
            }
        }

        return JSON.parse(JSON.stringify(this.checks)); // return a *copy*
    }


    /*

    System check

    */

    /**
     * configure system check
     * @returns {Object} promise
     */
    configSystemCheck() {
        return new Promise((resolve, reject) => {
            console.log(chalk.blue(this.marker));
            console.log(`Configuring system check`);

            const id = 'check-system';
            const configFile = path.resolve(path.join(cosi.reg_dir, `config-${id}.json`));
            const templateFile = configFile.replace('config-', 'template-');

            if (this._fileExists(configFile)) {
                console.log('\tCheck configuration already exists.', configFile);
                resolve();

                return;
            }

            const template = new Template(templateFile);
            const check = template.check;

            // set target to default (if check.target not already set in template)
            if (!{}.hasOwnProperty.call(check, 'target') || check.target === '') {
                check.target = '{{=cosi.host_target}}';
            }

            check.type = this.agentCheckType;

            // set the broker receiving for pulling metrics

            if (this.agentMode === 'push') {
                check.brokers = [ this.regConfig.broker.trap._cid ];
                check.config = {
                    asynch_metrics : 'true',
                    secret         : crypto.
                        randomBytes(2048).
                        toString('hex').
                        substr(0, 16)
                };
            } else {
                check.brokers = [ this.regConfig.broker.json._cid ];
                check.config.url = cosi.agent_url;
            }

            // some check types fail if there is not at least one metric...
            // add the activated metrics
            check.metrics = [ {
                name   : 'cosi_placeholder',
                status : 'active',
                type   : 'numeric'
            } ];

            // set the notes with cosi signature
            check.notes = this.regConfig.cosiNotes;

            this._setTags(check, id);
            this._setCustomCheckOptions(check, id);

            // save the configuration
            try {
                fs.writeFileSync(
                    configFile,
                    JSON.stringify(check, null, 4), {
                        encoding : 'utf8',
                        flag     : 'w',
                        mode     : 0o644
                    });
            } catch (err) {
                reject(err);

                return;
            }

            console.log(chalk.green('\tSaved configuration'), configFile);
            resolve();
        });
    }


    /**
     * create system check
     * @returns {Object} promise
     */
    createSystemCheck() {
        return new Promise((resolve, reject) => {
            console.log(chalk.blue(this.marker));
            console.log('Creating system check');

            const self = this;
            const regFile = path.resolve(path.join(cosi.reg_dir, 'registration-check-system.json'));
            const cfgFile = regFile.replace('registration-', 'config-');

            if (this._fileExists(regFile)) {
                console.log(chalk.bold('\tRegistration exists'), `using ${regFile}`);
                resolve(new Check(regFile));

                return;
            }

            if (!this._fileExists(cfgFile)) {
                reject(new Error(`Missing system check configuration file '${cfgFile}'`));

                return;
            }

            const check = new Check(cfgFile);

            if (check.verifyConfig()) {
                console.log('\tValid check config');
            }

            console.log('\tSending check configuration to Circonus API');

            check.create().
                then(() => {
                    console.log(`\tSaving registration ${regFile}`);
                    check.save(regFile, true);

                    console.log(chalk.green('\tCheck created:'), `${self.regConfig.account.ui_url}${check._checks[0].replace('check', 'checks')}`);
                    resolve(check);
                }).
                catch((err) => {
                    reject(err);
                });
        });
    }


    /**
     * finalize system check
     * @returns {Object} promise
     */
    finalizeSystemCheck() {
        return new Promise((resolve, reject) => {
            console.log(chalk.blue(this.marker));
            console.log(`Finalizing system check`);

            if (this.agentMode === 'pull') {
                console.log(chalk.green('OK'), 'no additional configuration needed for pull mode agent');
                resolve();

                return;
            }

            const bundle_id = this.checks.system.bundle_id;
            const submit_url = this.checks.system.submit_url;

            if (bundle_id === null || submit_url === null) {
                reject(new Error('Check meta data not initialized for system check'));

                return;
            }

            let cfgFile = null;
            let cfg = null;
            let msgItem = null;

            if (this.agentMode === 'push') {
                msgItem = 'NAD Push'; // console.log(`\tCreating NAD Push configuration ${npCfgFile}`);
                cfgFile = path.resolve(path.join(cosi.cosi_dir, '..', 'etc', 'circonus-nadpush.json'));
                cfg = JSON.stringify({
                    agent_url         : cosi.agent_url,
                    broker_servername : this._getTrapBrokerCn(submit_url),
                    check_url         : submit_url,
                    group             : cosi.cosi_os_dist.toLowerCase() === 'ubuntu' ? 'nogroup' : 'nobody',
                    user              : 'nobody'
                }, null, 4);
            } else if (this.agentMode === 'reverse') {
                const plugin_dir = path.resolve(path.join(cosi.nad_etc_dir, 'node-agent.d'));

                msgItem = 'NAD Reverse'; // console.log(`\tSaving NAD Reverse configuration ${nadCfgFile}`);
                cfgFile = path.resolve(path.join(cosi.etc_dir, 'circonus-nadreversesh'));
                cfg = [
                    'nadrev_listen_address="127.0.0.1:2609"',
                    'nadrev_enable=1',
                    `nadrev_plugin_dir=${plugin_dir}`,
                    `nadrev_check_id="${bundle_id}"`,
                    `nadrev_api_url="${cosi.api_url}"`,
                    `nadrev_key="${cosi.api_key}"`
                ].join('\n');
            }

            if (cfgFile === null || cfg === null || msgItem === null) {
                reject(new Error('Finalize misconfigured, one or more required settings are invalid'));

                return;
            }

            console.log(`\tCreating ${msgItem} configuration`);
            try {
                fs.writeFileSync(cfgFile, cfg, {
                    encoding : 'utf8',
                    flag     : 'w',
                    mode     : 0o644
                });
                console.log(chalk.green('\tSaved'), `${msgItem} configuration ${cfgFile}`);
            } catch (err) {
                reject(err);

                return;
            }

            resolve();
        });
    }


    /*

    Group check

    */


    /**
     * configure group check
     * @returns {Object} promise
     */
    configGroupCheck() {
        return new Promise((resolve, reject) => {
            console.log(chalk.blue(this.marker));
            console.log(`Configuring Group check`);

            if (!this.regConfig.group.enabled) {
                console.log('\tGroup check disabled, skipping.');
                this.emit('group.config.done');

                return;
            }

            const id = 'check-group';
            const configFile = path.resolve(path.join(cosi.reg_dir, `config-${id}.json`));
            const templateFile = configFile.replace('config-', 'template-');

            if (this._fileExists(configFile)) {
                console.log('\tCheck configuration already exists.', configFile);
                resolve();

                return;
            }

            const template = new Template(templateFile);
            const check = template.check;
            const hash = crypto.createHash('sha256');

            check.type = 'httptrap';

            // set the broker receiving for pulling metrics
            check.brokers = [ this.regConfig.broker.trap._cid.replace('/broker/', '') ];

            // add *ONLY* if there are no metrics defined in the template.
            if (!{}.hasOwnProperty.call(check, 'metrics') || !Array.isArray(check.metrics)) {
                check.metrics = [];
            }

            // set the notes with cosi signature
            check.notes = this.regConfig.cosiNotes;

            this._setTags(check, id);
            this._setCustomCheckOptions(check, id);

            // we want a consistent check definition so that when other members of the group
            // POST the check definition the *ONE* already created is returned.
            // e.g. display_name, target, tags, etc.
            //
            // update the hash after the target is set
            hash.update(check.target);

            check.config = {
                asynch_metrics : 'false', // NOTE must be false for per metric _fl settings to function correctly
                secret         : hash.
                    digest('hex').
                    substr(0, 16)
            };

            check.tags.push(`@group:${this.regConfig.group.id}`);

            // save the configuration
            try {
                fs.writeFileSync(
                    configFile,
                    JSON.stringify(check, null, 4), {
                        encoding : 'utf8',
                        flag     : 'w',
                        mode     : 0o644
                    });
            } catch (err) {
                reject(err);

                return;
            }

            console.log(chalk.green('\tSaved configuration'), configFile);
            resolve();
        });
    }


    /**
     * create group check
     * @returns {Object} promise
     */
    createGroupCheck() {
        return new Promise((resolve, reject) => {
            console.log(chalk.blue(this.marker));
            console.log('Creating trap check for Group');

            if (!this.regConfig.group.enabled) {
                console.log('\tGroup check disabled, skipping.');
                resolve(null);

                return;
            }

            const self = this;
            const regFile = path.resolve(path.join(cosi.reg_dir, 'registration-check-group.json'));
            const cfgFile = regFile.replace('registration-', 'config-');

            if (this._fileExists(regFile)) {
                console.log(chalk.bold('\tRegistration exists'), `using ${regFile}`);
                resolve(new Check(regFile));

                return;
            }

            if (!this._fileExists(cfgFile)) {
                reject(new Error(`Missing group check configuration file '${cfgFile}'`));

                return;
            }

            const check = new Check(cfgFile);

            if (check.verifyConfig()) {
                console.log('\tValid check config');
            }

            console.log('\tSending check configuration to Circonus API');

            check.create().
                then(() => {
                    console.log(`\tSaving registration ${regFile}`);
                    check.save(regFile);
                    console.log(chalk.green('\tCheck created:'), `${self.regConfig.account.ui_url}${check._checks[0].replace('/check/', '/checks/')}`);
                    resolve(check);
                }).
                catch((err) => {
                    reject(err);
                });
        });
    }


    /**
     * finalize group check
     * @returns {Object} promise
     */
    finalizeGroupCheck() {
        return new Promise((resolve) => {
            console.log(chalk.blue(this.marker));
            console.log(`Finalizing group check`);

            resolve();
        });
    }


    /*

    Utility methods

    */


    /**
     * save meta data to check object
     * @arg {String} id check identifier
     * @arg {Object} check definition
     * @returns {Undefined} nothing, emits event
     */
    _setCheckMeta(id, check) {
        assert.strictEqual(typeof id, 'string', 'id is required');
        assert.equal(typeof check, 'object', 'check is required');

        if (!{}.hasOwnProperty.call(this.checks, id)) {
            this.emit('error', new Error(`Unknown check, ${id}, unable to set meta data`));
        }

        const meta = {
            bundle_id  : null,
            id         : null,
            submit_url : null,
            uuid       : null
        };

        meta.id = check._checks[0].replace('/check/', '');
        meta.uuid = check._check_uuids[0];
        meta.bundle_id = check._cid.replace('/check_bundle/', '');

        if (check.type === 'httptrap') {
            meta.submit_url = check.config.submission_url;
        } else {
            meta.submit_url = check._reverse_connection_urls[0].replace('mtev_reverse', 'https').replace('check', 'module/httptrap');
            meta.submit_url += `/${check.config['reverse:secret_key']}`;
        }

        this.checks[id] = JSON.parse(JSON.stringify(meta)); // make a *copy*
    }


    /**
     * set custom options in check configuration
     * @arg {Object} cfg check configuration
     * @arg {String} id check identifier
     * @returns {Undefined} nothing, emits event
     */
    _setCustomCheckOptions(cfg, id) {
        assert.equal(typeof cfg, 'object', 'cfg is required');
        assert.equal(typeof id, 'string', 'id is required');

        console.log('\tApplying custom config options and interpolating templates');

        const idParts = id.split('-', 2);
        const options = [
            'metric_limit',
            'display_name',
            'target'
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

                        if ({}.hasOwnProperty.call(custom[cfgId], opt)) { // eslint-disable-line max-depth
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

            if (opt !== 'metric_limit') {
                console.log(`\tInterpolating ${opt} ${cfg[opt]}`);
                cfg[opt] = this._expand(cfg[opt], data); // eslint-disable-line no-param-reassign
            }
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
     * determine broker CN for HTTPTRAP broker
     * @arg {String} trapUrl url for the trap broker
     * @returns {String} broker CN or null
     */
    _getTrapBrokerCn(trapUrl) {
        const urlInfo = url.parse(trapUrl);
        const urlHost = urlInfo.hostname;

        if (urlHost === null) {
            return null;
        }

        for (let i = 0; i < this.regConfig.broker.trap._details.length; i++) {
            const detail = this.regConfig.broker.trap._details[i];

            if (detail.status !== 'active') {
                continue;
            }
            if (detail.cn === urlHost) {
                return null;
            } else if (detail.ipaddress === urlHost) {
                return detail.cn;
            } else if (detail.external_host === urlHost) {
                return detail.cn;
            }
        }

        return null;
    }

}

module.exports = Checks;

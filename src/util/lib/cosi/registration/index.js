// Copyright 2016 Circonus, Inc. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

'use strict';

const assert = require('assert');
const Events = require('events').EventEmitter;
const fs = require('fs');
const os = require('os');
const path = require('path');

const chalk = require('chalk');
const dot = require('dot');

const cosi = require(path.resolve(path.join(__dirname, '..')));
const Metrics = require(path.resolve(path.join(cosi.lib_dir, 'metrics')));

class Registration extends Events {

    /**
     * registration base class
     * @arg {Boolean} quiet information messages
     */
    constructor(quiet) {
        super();

        this.marker = '==========';

        this.agentMode = cosi.agent_mode.toLowerCase();
        this.agentCheckType = 'json:nad';
        if (this.agentMode === 'push') {
            this.agentCheckType = 'httptrap';
        }

        this.quiet = quiet;

        this.regConfigFile = path.resolve(path.join(cosi.reg_dir, 'setup-config.json'));
        this.regConfig = {
            account : null,
            broker  : {
                json : null,
                trap : null
            },
            cosiNotes : `cosi:register,cosi_id:${cosi.cosi_id}`,
            cosiTags  : [
                'cosi:install',
                `distro:${cosi.cosi_os_dist}-${cosi.cosi_os_vers}`,
                `arch:${cosi.cosi_os_arch}`,
                `os:${cosi.cosi_os_type}`
            ],
            group: {
                enabled : false,
                id      : null
            },
            metricsFile  : path.join(cosi.reg_dir, 'setup-metrics.json'),
            templateData : {
                host_group_id : null,
                host_name     : cosi.custom_options.host_name || os.hostname(),
                host_tags     : cosi.custom_options.host_tags || [],
                host_target   : null,
                host_vars     : cosi.custom_options.host_vars || {}
            }
        };

        if (typeof cosi.cosi_group_id === 'string' && cosi.cosi_group_id.trim().length > 0) {
            this.regConfig.group.enabled = true;
            this.regConfig.group.id = cosi.cosi_group_id.trim();
            this.regConfig.templateData.host_vars.group_id = this.regConfig.group.id;
        }

        this.globalMeta = {};
        try {
            const globalMetaFile = path.resolve(path.join(cosi.reg_dir, 'meta-global.json'));
            const meta = require(globalMetaFile); // eslint-disable-line global-require

            this.globalMeta = JSON.parse(JSON.stringify(meta));
        } catch (err) {
            // only raise parsing errors, global meta files are not used in all instances
            if (err.code !== 'MODULE_NOT_FOUND') {
                throw err;
            }
        }

        this.regConfig.templateData.host_vars.num_cpus = os.cpus().length;

        this.on('error', (err) => {
            console.log(chalk.red('***************'));
            console.dir(err);
            console.log(chalk.red('***************'));
            process.exit(1); // eslint-disable-line no-process-exit
        });

        dot.templateSettings.varname = 'cosi';
    }


    /**
     * load custom registration configuration
     * @returns {Object} error or null
     */
    loadRegConfig() {
        try {
            this.regConfig = require(this.regConfigFile); // eslint-disable-line global-require
        } catch (err) {
            return err;
        }

        return null;
    }


    /**
     * save registration configuration
     * @returns {Boolean} saved or not
     */
    saveRegConfig() {
        console.log(chalk.blue(this.marker));
        console.log('Save registration configuration');

        try {
            fs.writeFileSync(
                this.regConfigFile,
                JSON.stringify(this.regConfig, null, 4), {
                    encoding : 'utf8',
                    flag     : 'w',
                    mode     : 0o644
                });
        } catch (err) {
            this.emit('error', err);

            return false;
        }

        console.log(chalk.green('Registration configuration saved', this.regConfigFile));

        return true;
    }


    /**
     * load available metrics from NAD
     * @returns {Object} promise
     */
    loadMetrics() {
        return new Promise((resolve, reject) => {
            console.log(chalk.blue(this.marker));
            console.log('Loading available metrics');

            // *always* fetch a fresh copy of the metrics
            // the setup-metrics.json is for DEBUGGING the
            // initial registration run **ONLY**

            const metrics = new Metrics();

            metrics.load().
                then(() => {
                    return metrics.getMetricStats();
                }).
                then((stats) => {
                    let totalMetrics = 0;

                    for (const group in stats) { // eslint-disable-line guard-for-in
                        console.log(`\t${group} has ${stats[group]} metrics`);
                        totalMetrics += stats[group];
                    }
                    console.log(`\tTotal metrics: ${totalMetrics}`);

                    return metrics.getMetrics();
                }).
                then((agentMetrics) => {
                    this.metrics = agentMetrics;

                    this.metricList = [];

                    Object.keys(this.metrics).forEach((id) => {
                        Object.keys(this.metrics[id]).forEach((val) => {
                            this.metricList.push(`${id}\`${val}`);
                        });
                    });
                    this.metricList.sort();

                    console.log(chalk.green('Metrics loaded'));
                    resolve();
                }).
                catch((err) => {
                    reject(err);
                });
        });
    }


    /**
     * helper function, check if file exists
     * @arg {String} cfgFile to check for
     * @returns {Boolean} exists and is file
     */
    _fileExists(cfgFile) {
        assert.equal(typeof cfgFile, 'string', 'cfgFile is required');

        try {
            const stats = fs.statSync(cfgFile);

            return stats.isFile();
        } catch (err) {
            if (err.code !== 'ENOENT') {
                this.emit('error', err);
            }
        }

        return false;
    }


    /**
     * helper function, set tags on api object
     * @arg {Object} cfg for api object being tagged
     * @arg {String} id of api object being tagged to locate specific global/custom tags
     * @returns {Undefined} nothing
     */
    _setTags(cfg, id) {
        assert.equal(typeof cfg, 'object', 'cfg is required');
        assert.equal(typeof id, 'string', 'id is required');

        cfg.tags = cfg.tags || []; // eslint-disable-line no-param-reassign

        const addTags = (config, tags) => {
            if (!config.tags) {
                return;
            }
            if (!Array.isArray(config.tags)) {
                return;
            }
            if (!Array.isArray(tags)) {
                return;
            }

            for (const tag of tags) {
                config.tags.push(tag);
            }
        };

        addTags(cfg, this.regConfig.cosiTags);
        addTags(cfg, this.regConfig.templateData.host_tags || []);

        const idParts = id.split('-', 3);

        if (idParts.length >= 2) {
            const cfgType = idParts[0];
            const cfgId = idParts[1];
            const cfgItemId = idParts.length > 2 ? idParts[2] : null;

            if (cfgType && cosi.custom_options[cfgType]) {
                const custom = cosi.custom_options[cfgType];

                addTags(cfg, custom.tags || []);
                if (cfgId && {}.hasOwnProperty.call(custom, cfgId)) {
                    addTags(cfg, custom[cfgId].tags || []);
                    if (cfgItemId && {}.hasOwnProperty.call(custom[cfgId], cfgItemId)) {
                        addTags(cfg, custom[cfgId][cfgItemId].tags || []);
                    }
                }
            }
        }
    }


    /**
     * helper function, merges data from template, configs, and system
     * @arg {String} id of api object being tagged to locate specific global/custom tags
     * @returns {Undefined} nothing
     */
    _mergeData(id) {
        assert.equal(typeof id, 'string', 'id is required');

        const idParts = id.split('-', 3);
        const defaults = JSON.parse(JSON.stringify(this.regConfig.templateData));
        const data = {
            host_name   : defaults.host_name,
            host_target : defaults.host_target
        };

        // add relevant check meta data if checkMeta set by subclass
        if (this.checkMeta !== null && {}.hasOwnProperty.call(this, 'checkMeta')) {
            data.check_uuid = this.checkMeta.system.uuid;
            data.check_id = this.checkMeta.system.id;
        }

        if (this.globalMeta !== null && typeof this.globalMeta === 'object') {
            for (const key in this.globalMeta) {
                if ({}.hasOwnProperty.call(this.globalMeta, key)) {
                    data[key] = this.globalMeta[key];
                }
            }
        }

        const propAdd = (target, source) => {
            for (const prop in source) {
                if ({}.hasOwnProperty.call(source, prop)) {
                    target[prop] = source[prop]; // eslint-disable-line no-param-reassign
                }
            }
        };

        propAdd(data, defaults.host_vars || {});

        if (idParts.length >= 2) {
            const cfgType = idParts[0];
            const cfgId = idParts[1];
            const cfgItemId = idParts.length > 2 ? idParts[2] : null;

            if (cfgType === 'graph' && cfgItemId) {
                data.graph_item = cfgItemId;
            }

            if (cfgType && cosi.custom_options[cfgType]) {
                const custom = cosi.custom_options[cfgType];

                propAdd(data, custom.vars || {});

                if (cfgId && {}.hasOwnProperty.call(custom, cfgId)) {
                    propAdd(data, custom[cfgId].vars || {});
                    if (cfgItemId && {}.hasOwnProperty.call(custom[cfgId], cfgItemId)) {
                        propAdd(data, custom[cfgId][cfgItemId].vars || {});
                    }
                }
            }
        }

        return data;
    }


    /**
     * helper function, interpolate specific template fields. (used to isolate use of 'dot' to single location)
     * @arg {String} template to be interpolated
     * @arg {Object} vars custom variables to be used
     * @returns {String} the interpolated value
     */
    _expand(template, vars) { // eslint-disable-line class-methods-use-this
        assert.equal(typeof template, 'string', 'template is required');
        assert.equal(typeof vars, 'object', 'vars is required');

        const fn = dot.template(template);

        return fn(vars);
    }

}

module.exports = Registration;

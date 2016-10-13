'use strict';

/* eslint-env node, es6 */
/* eslint-disable no-magic-numbers, global-require */

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
            broker: {
                json: null,
                trap: null
            },
            account: null,
            metricsFile: path.join(cosi.reg_dir, 'setup-metrics.json'),
            cosiTags: [
                'cosi:install',
                `distro:${cosi.cosi_os_dist}-${cosi.cosi_os_vers}`,
                `arch:${cosi.cosi_os_arch}`,
                `os:${cosi.cosi_os_type}`
            ],
            cosiNotes: `cosi:register,cosi_id:${cosi.cosi_id}`,
            templateData: {
                host_name: cosi.custom_options.host_name || os.hostname(),
                host_target: null,
                host_vars: cosi.custom_options.host_vars || {},
                host_tags: cosi.custom_options.host_tags || []
            },
            statsd: {
                enabled: cosi.statsd === 1,
                port: cosi.statsd_port || 8125
            }
        };

        this.globalMeta = {};
        try {
            const globalMetaFile = path.resolve(path.join(cosi.reg_dir, 'meta-global.json'));
            const meta = require(globalMetaFile);

            this.globalMeta = JSON.parse(JSON.stringify(meta));
        } catch (err) {
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


    loadRegConfig() {
        try {
            this.regConfig = require(this.regConfigFile);
        } catch (err) {
            return err;
        }
        return null;
    }


    saveRegConfig() {
        console.log(chalk.blue(this.marker));
        console.log('Save registration configuration');

        try {
            fs.writeFileSync(
                this.regConfigFile,
                JSON.stringify(this.regConfig, null, 4),
                { encoding: 'utf8', mode: 0o644, flag: 'w' });
        } catch (err) {
            this.emit('error', err);
            return false;
        }

        console.log(chalk.green('Registration configuration saved', this.regConfigFile));
        return true;
    }


    loadMetrics() {
        console.log(chalk.blue(this.marker));
        console.log('Loading available metrics');

        // *always* fetch a fresh copy of the metrics
        // the setup-metrics.json is for DEBUGGING the initial registration run

        const self = this;
        const metrics = new Metrics(cosi.agent_url);

        metrics.load((err) => {
            if (err) {
                self.emit('error', err);
                return;
            }
            metrics.getMetricStats((metricStatsError, stats) => {
                if (metricStatsError) {
                    self.emit('error', metricStatsError);
                }

                let totalMetrics = 0;

                for (const group in stats) { // eslint-disable-line guard-for-in
                    console.log(`\t${group} has ${stats[group]} metrics`);
                    totalMetrics += stats[group];
                }

                metrics.getMetrics((metricsError, agentMetrics) => {
                    if (metricsError) {
                        self.emit('error', metricsError);
                        return;
                    }
                    console.log(`\tTotal metrics: ${totalMetrics}`);
                    self.metrics = agentMetrics;
                    console.log(chalk.green('Metrics loaded'));
                    self.emit('metrics.load.done');
                });
            });
        });
    }


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


    _setTags(cfg, id) {
        assert.equal(typeof cfg, 'object', 'cfg is required');
        assert.equal(typeof id, 'string', 'id is required');

        cfg.tags = cfg.tags || []; // eslint-disable-line no-param-reassign

        function addTags(config, tags) {
            if (!config.tags) {
                return;
            }
            if (!Array.isArray(config.tags)) {
                return;
            }
            if (!Array.isArray(tags)) {
                return;
            }

            // for (const tag of tags) {
            for (let i = 0; i < tags.length; i++) {
                const tag = tags[i];

                config.tags.push(tag);
            }
        }

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


    _mergeData(id) {
        assert.equal(typeof id, 'string', 'id is required');

        const idParts = id.split('-', 3);
        const defaults = JSON.parse(JSON.stringify(this.regConfig.templateData));
        const data = {
            host_name: defaults.host_name,
            host_target: defaults.host_target
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

        function propAdd(target, source) {
            for (const prop in source) {
                if ({}.hasOwnProperty.call(source, prop)) {
                    target[prop] = source[prop]; // eslint-disable-line no-param-reassign
                }
            }
        }

        // data = Object.assign(data, defaults.host_vars);
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

                // data = Object.assign(data, custom.vars || {});
                propAdd(data, custom.vars || {});

                if (cfgId && {}.hasOwnProperty.call(custom, cfgId)) {
                    // data = Object.assign(data, custom[cfgId].vars || {});
                    propAdd(data, custom[cfgId].vars || {});
                    if (cfgItemId && {}.hasOwnProperty.call(custom[cfgId], cfgItemId)) {
                        // data = Object.assign(data, custom[cfgId][cfgItemId].vars || {});
                        propAdd(data, custom[cfgId][cfgItemId].vars || {});
                    }
                }
            }
        }

        return data;
    }


    _expand(template, vars) {
        assert.equal(typeof template, 'string', 'template is required');
        assert.equal(typeof vars, 'object', 'vars is required');

        const fn = dot.template(template);

        return fn(vars);
    }

}

module.exports = Registration;

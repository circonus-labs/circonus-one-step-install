'use strict';

/* eslint-env node, es6 */

/* eslint-disable global-require */

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

    constructor(quiet) {
        super(quiet);

        const err = this.loadRegConfig();

        if (err !== null) {
            this.emit('error', err);
            return;
        }

        this.checks = {
            system: null,
            statsd: null
        };
    }

    create(cb) {
        console.log(chalk.bold('\nRegistration - checks'));

        const self = this;

        this.once('check.config', this.configSystemCheck);
        this.once('check.config.done', () => {
            self.emit('check.create');
        });

        this.once('check.create', this.createSystemCheck);
        this.once('check.create.done', (check) => {
            self._setCheckMeta('system', check);
            self.emit('check.finalize');
        });

        this.once('check.finalize', this.finalizeSystemCheck);
        this.once('check.finalize.done', () => {
            if (self.regConfig.statsd.enabled) {
                self.emit('statsd.config');
            } else {
                self.emit('checks.done');
            }
        });

        if (self.regConfig.statsd.enabled) {
            this.once('statsd.config', this.configStatsdCheck);
            this.once('statsd.config.done', () => {
                self.emit('statsd.create');
            });

            this.once('statsd.create', this.createStatsdCheck);
            this.once('statsd.create.done', (check) => {
                self._setCheckMeta('statsd', check);
                self.emit('statsd.finalize');
            });

            this.once('statsd.finalize', this.finalizeStatsdCheck);
            this.once('statsd.finalize.done', () => {
                self.emit('checks.done');
            });
        }

        this.once('checks.done', () => {
            if (typeof cb === 'function') {
                cb();
                return;
            }
        });

        this.emit('check.config');
    }

    update(cb) {
        console.log(chalk.blue(this.marker));
        console.log('Updating system check');

        const regFile = path.resolve(cosi.reg_dir, 'registration-check-system.json');

        if (!this._fileExists(regFile)) {
            this.emit('error', new Error(`System check registration file not found ${regFile}`));
            return;
        }

        console.log(chalk.bold('\tRegistration found'), `using ${regFile}`);

        const check = new Check(regFile);
        const checkMetrics = check.metrics;
        const visualMetrics = this._extractMetricsFromVisuals();
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
                metricTags = require(metricTagFile);
            } catch (err) {
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

                        if (currTags.indexOf(tag) === -1) {
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
            this.emit('check.update.done');
            cb();
            return;
        }

        const self = this;

        console.log(chalk.bold(`\tUpdating system check`), 'new metrics found');
        if (!{}.hasOwnProperty.call(check, 'metric_limit')) {
            check.metric_limit = 0;
        }
        check.update((err, result) => {
            if (err !== null) {
                self.emit('error', err);
                return;
            }
            try {
                fs.writeFileSync(regFile, JSON.stringify(result, null, 4), { encoding: 'utf8', mode: 0o644, flag: 'w' });
            } catch (saveError) {
                self.emit('error', saveError);
                return;
            }
            console.log(chalk.green('\tSaved'), `updated registration to file ${regFile}`);
            cb();
            return;
        });
    }

    _extractMetricsFromVisuals() {
        const activeMetrics = [];

        console.log(chalk.bold('Collecting required metrics from registered visuals'));

        const files = fs.readdirSync(cosi.reg_dir);

        // for (const file of files) {
        for (let fileIdx = 0; fileIdx < files.length; fileIdx++) {
            const file = files[fileIdx];

            if (file.match(/^registration-graph-.*\.json$/)) {
                const configFile = path.resolve(path.join(cosi.reg_dir, file));
                let graph = null;

                console.log(`\tLoading required metrics from ${configFile}`);

                try {
                    graph = require(configFile);
                } catch (err) {
                    console.log(chalk.yellow('\tWARN'), `Unable to load ${configFile} ${err}, skipping`);
                    continue;
                }

                // for (const dp of graph.datapoints) {
                for (let dpIdx = 0; dpIdx < graph.datapoints.length; dpIdx++) {
                    const dp = graph.datapoints[dpIdx];

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
                        name: dp.metric_name,
                        type: dp.metric_type,
                        status: 'active'
                    });
                }
            } else if (file.match(/^registration-dashboard-.*\.json$/)) {
                const configFile = path.resolve(path.join(cosi.reg_dir, file));
                let dashboard = null;

                console.log(`\tLoading required metrics from ${configFile}`);

                try {
                    dashboard = require(configFile);
                } catch (err) {
                    console.log(chalk.yellow('\tWARN'), `Unable to load ${configFile} ${err}, skipping`);
                    continue;
                }

                for (let wIdx = 0; wIdx < dashboard.widgets.length; wIdx++) {
                    const widget = dashboard.widgets[wIdx];

                    if (widget.type !== 'gauge') {
                        continue;
                    }

                    console.log('\t\tAdding required metric:', widget.settings.metric_name);
                    activeMetrics.push({
                        name: widget.settings.metric_name,
                        // no way to determine if the metric should
                        // be a histogram based on use in dashboard.
                        // may need to add metric_type to gauge widget
                        // settings as is in graph datapoints.
                        type: widget.settings._type === 'text' ? 'text' : 'numeric',
                        status: 'active'
                    });
                }
            }
        }

        return activeMetrics;
    }

    getMeta() {
        if (this.checks.system === null) {
            const regFile = path.resolve(path.join(cosi.reg_dir, 'registration-check-system.json'));

            if (!this._fileExists(regFile)) {
                this.emit('error', new Error('System check registration file not found'));
                return null;
            }
            try {
                const check = require(regFile);

                this._setCheckMeta('system', check);
            } catch (err) {
                this.emit('error', err);
                return null;
            }
        }

        if (this.checks.statsd === null && this.regConfig.statsd.enabled) {
            const regFile = path.resolve(path.join(cosi.reg_dir, 'registration-check-statsd.json'));

            if (!this._fileExists(regFile)) {
                this.emit('error', new Error('StatsD check registration file not found'));
                return null;
            }
            try {
                const check = require(regFile);

                this._setCheckMeta('system', check);
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


    configSystemCheck() {
        console.log(chalk.blue(this.marker));
        console.log(`Configuring system check`);

        const id = 'check-system';
        const configFile = path.resolve(path.join(cosi.reg_dir, `config-${id}.json`));
        const templateFile = configFile.replace('config-', 'template-');

        if (this._fileExists(configFile)) {
            console.log('\tCheck configuration already exists.', configFile);
            this.emit('check.config.done');
            return;
        }

        const template = new Template(templateFile);
        const check = template.check;

        check.type = this.agentCheckType;

        // set the broker receiving for pulling metrics

        if (this.agentMode === 'push') {
            check.brokers = [
                this.regConfig.broker.trap._cid.replace('/broker/', '')
            ];
            check.config = {
                asynch_metrics: true,
                secret: crypto.randomBytes(2048).toString('hex').substr(0, 16)
            };
        } else {
            check.brokers = [
                this.regConfig.broker.json._cid.replace('/broker/', '')
            ];
            check.config.url = cosi.agent_url;
        }


        // add the activated metrics
        check.metrics = [
            {
                name: 'cosi_placeholder',
                type: 'numeric',
                status: 'active'
            }
        ];

        // set the notes with cosi signature
        check.notes = this.regConfig.cosiNotes;

        this._setTags(check, id);
        this._setCustomCheckOptions(check, id);

        // save the configuration
        try {
            fs.writeFileSync(
                configFile,
                JSON.stringify(check, null, 4),
                { encoding: 'utf8', mode: 0o644, flag: 'w' });
        } catch (err) {
            this.emit('error', err);
            return;
        }

        console.log(chalk.green('\tSaved configuration'), configFile);
        this.emit('check.config.done');
    }


    createSystemCheck() {
        console.log(chalk.blue(this.marker));
        console.log('Creating system check');

        const self = this;
        const regFile = path.resolve(path.join(cosi.reg_dir, 'registration-check-system.json'));
        const cfgFile = regFile.replace('registration-', 'config-');

        if (this._fileExists(regFile)) {
            console.log(chalk.bold('\tRegistration exists'), `using ${regFile}`);
            this.emit('check.create.done', new Check(regFile));
            return;
        }

        if (!this._fileExists(cfgFile)) {
            this.emit('error', new Error(`Missing system check configuration file '${cfgFile}'`));
            return;
        }

        const check = new Check(cfgFile);

        if (check.verifyConfig()) {
            console.log('\tValid check config');
        }

        console.log('\tSending check configuration to Circonus API');

        check.create((err) => {
            if (err) {
                self.emit('error', err);
                return;
            }

            console.log(`\tSaving registration ${regFile}`);
            check.save(regFile, true);

            console.log(chalk.green('\tCheck created:'), `${self.regConfig.account.ui_url}${check._checks[0].replace('check', 'checks')}`);
            self.emit('check.create.done', check);
        });

    }


    finalizeSystemCheck() {
        console.log(chalk.blue(this.marker));
        console.log(`Finalizing system check`);

        const bundle_id = this.checks.system.bundle_id;
        const submit_url = this.checks.system.submit_url;

        if (bundle_id === null || submit_url === null) {
            this.emit('error', new Error('Check meta data not initialized for system check'));
            return;
        }

        let cfgFile = null;
        let cfg = null;
        let msgItem = null;

        if (this.agentMode === 'push') {
            msgItem = 'NAD Push'; // console.log(`\tCreating NAD Push configuration ${npCfgFile}`);
            cfgFile = path.resolve(path.join(cosi.cosi_dir, '..', 'etc', 'circonus-nadpush.json'));
            cfg = JSON.stringify({
                user: 'nobody',
                group: cosi.cosi_os_dist.toLowerCase() === 'ubuntu' ? 'nogroup' : 'nobody',
                agent_url: cosi.agent_url,
                check_url: submit_url,
                broker_servername: this._getTrapBrokerCn(submit_url)
            }, null, 4);

        } else if (this.agentMode === 'reverse') {
            msgItem = 'NAD Reverse'; // console.log(`\tSaving NAD Reverse configuration ${nadCfgFile}`);
            cfgFile = path.resolve(path.join(cosi.etc_dir, 'circonus-nadreversesh'));
            const nadOpts = [
                `nadrev_plugin_dir="${path.resolve(path.join(cosi.cosi_dir, '..', 'etc', 'node-agent.d'))}"`,
                'nadrev_listen_address="127.0.0.1:2609"',
                'nadrev_enable=1',
                `nadrev_check_id="${bundle_id}"`,
                `nadrev_key="${cosi.api_key}"`
            ];

            const apiUrl = url.parse(cosi.api_url);

            if (apiUrl.hostname !== 'api.circonus.com') {
                nadOpts.push(`nadrev_apihost=${apiUrl.hostname}`);
                nadOpts.push(`nadrev_apiprotocol=${apiUrl.protocol}`);

                if (apiUrl.port !== null) {
                    nadOpts.push(`nadrev_apiport=${apiUrl.port}`);
                }

                if (apiUrl.path !== '/') {
                    nadOpts.push(`nadrev_apipath=${apiUrl.path}`);
                }
            }

            cfg = nadOpts.join('\n');
        }

        if (cfgFile === null || cfg === null || msgItem === null) {
            this.emit('error', new Error('Finalize misconfigured, one or more required settings are invalid'));
            return;
        }

        console.log(`\tCreating ${msgItem} configuration`);
        try {
            fs.writeFileSync(cfgFile, cfg, { encoding: 'utf8', mode: 0o644, flag: 'w' });
            console.log(chalk.green('\tSaved'), `${msgItem} configuration ${cfgFile}`);
        } catch (err) {
            this.emit('error', err);
            return;
        }

        this.emit('check.finalize.done');

    }


    /*

    StatsD check

    */


    configStatsdCheck() {
        console.log(chalk.blue(this.marker));
        console.log(`Configuring StatsD check`);

        if (!this.regConfig.statsd.enabled) {
            console.log('\tStatsD check disabled, skipping.');
            this.emit('statsd.config.done');
            return;
        }

        const id = 'check-statsd';
        const configFile = path.resolve(path.join(cosi.reg_dir, `config-${id}.json`));
        const templateFile = configFile.replace('config-', 'template-');

        if (this._fileExists(configFile)) {
            console.log('\tCheck configuration already exists.', configFile);
            this.emit('statsd.config.done');
            return;
        }

        const template = new Template(templateFile);
        const check = template.check;

        check.type = 'httptrap';
        check.config = {
            asynch_metrics: true,
            secret: crypto.randomBytes(2048).toString('hex').substr(0, 16)
        };

        // set the broker receiving for pulling metrics
        check.brokers = [
            this.regConfig.broker.trap._cid.replace('/broker/', '')
        ];

        // add *ONLY* if there are no metrics defined in the template.
        if (!{}.hasOwnProperty.call(check, 'metrics') || !Array.isArray(check.metrics)) {
            check.metrics = [];
        }
        if (check.metrics.length === 0) {
            check.metrics.push({
                name: 'statsd`num_stats',
                type: 'numeric',
                status: 'active'
            });
        }

        // set the notes with cosi signature
        check.notes = this.regConfig.cosiNotes;

        this._setTags(check, id);
        this._setCustomCheckOptions(check, id);

        // save the configuration
        try {
            fs.writeFileSync(
                configFile,
                JSON.stringify(check, null, 4),
                { encoding: 'utf8', mode: 0o644, flag: 'w' });
        } catch (err) {
            this.emit('error', err);
            return;
        }

        console.log(chalk.green('\tSaved configuration'), configFile);
        this.emit('statsd.config.done');

    }


    createStatsdCheck() {
        console.log(chalk.blue(this.marker));
        console.log('Creating trap check for StatsD');

        if (!this.regConfig.statsd.enabled) {
            console.log('\tStatsD check disabled, skipping.');
            this.emit('statsd.create.done');
            return;
        }

        const self = this;
        const regFile = path.resolve(path.join(cosi.reg_dir, 'registration-check-statsd.json'));
        const cfgFile = regFile.replace('registration-', 'config-');

        if (this._fileExists(regFile)) {
            console.log(chalk.bold('Registration exists'), `using ${regFile}`);
            this.emit('statsd.create.done', new Check(regFile));
            return;
        }

        if (!this._fileExists(cfgFile)) {
            this.emit('error', new Error(`Missing statsd check configuration file '${cfgFile}'`));
            return;
        }

        const check = new Check(cfgFile);

        if (check.verifyConfig()) {
            console.log('\tValid check config');
        }

        console.log('\tSending check configuration to Circonus API');

        check.create((err) => {
            if (err) {
                self.emit('error', err);
                return;
            }

            console.log(`\tSaving registration ${regFile}`);
            check.save(regFile);
            console.log(chalk.green('\tCheck created:'), `${self.regConfig.account.ui_url}${check._checks[0].replace('/check/', '/checks/')}`);
            self.emit('statsd.create.done', check);
        });
    }


    finalizeStatsdCheck() {
        console.log(chalk.blue(this.marker));
        console.log(`Finalizing system check`);

        if (!this.regConfig.statsd.enabled) {
            console.log('\tStatsD check disabled, skipping.');
            this.emit('statsd.finalize.done');
            return;
        }

        const submit_url = this.checks.statsd.submit_url;

        const statsdCfgFile = path.resolve(path.join(cosi.etc_dir, 'statsd.json'));
        const circonusBackend = path.join('.', 'backends', 'circonus');

        console.log(`\tCreating StatsD configuration ${statsdCfgFile}`);

        // default configuration
        let statsdConfig = {
            port: this.regConfig.statsd.port,
            address: '127.0.0.1',
            flushInterval: 60000,
            keyNameSanitize: false,
            backends: [ circonusBackend ],
            circonus: {
                check_url: submit_url,
                forceGC: true
            }
        };

        // load an existing configuration, if it exists
        try {
            statsdConfig = require(statsdCfgFile);
        } catch (err) {
            if (err.code !== 'MODULE_NOT_FOUND') {
                this.emit('error', err);
                return;
            }
        }

        // set check_url
        if (!{}.hasOwnProperty.call(statsdConfig, 'circonus')) {
            statsdConfig.circonus = {};
        }
        statsdConfig.circonus.check_url = submit_url;

        // add circonus backend if it is not already defined
        if (!{}.hasOwnProperty.call(statsdConfig, 'backends') || !Array.isArray(statsdConfig.backends)) {
            statsdConfig.backends = [];
        }
        if (statsdConfig.backends.indexOf(circonusBackend) === -1) {
            statsdConfig.backends.push(circonusBackend);
        }

        console.log(`\tCreating StatsD configuration`);
        try {
            fs.writeFileSync(statsdCfgFile, JSON.stringify(statsdConfig, null, 4), { encoding: 'utf8', mode: 0o644, flag: 'w' });
            console.log(chalk.green('\tSaved'), `StatsD configuration ${statsdCfgFile}`);
        } catch (statsdConfigErr) {
            this.emit('error', statsdConfigErr);
            return;
        }

        this.emit('statsd.finalize.done');
    }


    /*

    Utility methods

    */


    _setCheckMeta(id, check) {
        assert.strictEqual(typeof id, 'string', 'id is required');
        assert.equal(typeof check, 'object', 'check is required');

        if (!{}.hasOwnProperty.call(this.checks, id)) {
            this.emit('error', new Error(`Unknown check, ${id}, unable to set meta data`));
        }

        const meta = {
            id: null,
            uuid: null,
            bundle_id: null,
            submit_url: null
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

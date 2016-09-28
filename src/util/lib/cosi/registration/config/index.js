'use strict';

/* eslint-env node, es6 */
/* eslint-disable no-magic-numbers, global-require, camelcase */

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const chalk = require('chalk');

const cosi = require(path.resolve(path.resolve(__dirname, '..', '..', '..', 'cosi')));
const Registration = require(path.resolve(cosi.lib_dir, 'registration'));
const Template = require(path.join(cosi.lib_dir, 'template'));
const templateList = require(path.join(cosi.lib_dir, 'template', 'list'));
const Check = require(path.resolve(cosi.lib_dir, 'check'));

class Config extends Registration {

    constructor(quiet) {
        super(quiet);

        this.metrics = null;
        this.templateList = null;
        this.checkMetrics = null;

        throw new Error('deprecated');

    }

    config() {
        console.log(chalk.bold('\nRegistration configuration'));

        const self = this;

        this.once('metrics.load', this.loadMetrics);
        this.once('metrics.load.done', () => {
            self.emit('templates.find');
        });

        this.once('templates.find', this.findTemplates);
        this.once('templates.find.done', () => {
            self.emit('graphs.config');
        });

        this.once('graphs.config', this.configGraphs);
        this.once('graphs.config.done', () => {
            self.emit('check.config');
        });

        this.once('check.config', this.configSystemCheck);
        this.once('check.config.done', () => {
            self.emit('statsd.config');
        });

        this.once('statsd.config', this.configStatsdCheck);
        this.once('statsd.config.done', () => {
            self.emit('worksheet.config');
        });

        this.once('worksheet.config', this.configWorksheet);
        this.once('worksheet.config.done', () => {
            self.emit('config.done');
        });

        this.loadRegConfig();
        this.emit('metrics.load');
    }


    loadRegConfig() {
        console.log(chalk.blue(this.marker));
        console.log('Loading registration configuration');

        try {
            this.regConfig = require(this.regConfigFile);
        } catch (err) {
            this.emit('error', err);
            return;
        }

        console.log(chalk.green('Registration configuration loaded'), this.regConfigFile);
        this.emit('regconf.load.done');
    }


    loadMetrics() {
        console.log(chalk.blue(this.marker));
        console.log('Loading available metrics');

        const metricsFile = path.resolve(this.regConfig.metricsFile);

        try {
            this.metrics = require(metricsFile);
        } catch (err) {
            this.emit('error', err);
            return;
        }

        console.log(chalk.green('Metrics loaded'), metricsFile);
        this.emit('metrics.load.done');

    }


    findTemplates() {
        console.log(chalk.blue(this.marker));
        console.log('Identifying check and graph templates');

        const self = this;

        templateList(this.regDir, (listError, templates) => {
            if (listError) {
                self.emit('error', listError);
                return;
            }

            self.templateList = {};

            // for (const template of templates) {
            for (let i = 0; i < templates.length; i++) {
                const template = templates[i];
                const templateType = template.config.type;
                const templateId = template.config.id;

                console.log(`\tFound ${templateType}-${templateId} ${template.file}`);
                if (!{}.hasOwnProperty.call(self.templateList, templateType)) {
                    self.templateList[templateType] = [];
                }

                if (templateType === 'graph') {
                    if ({}.hasOwnProperty.call(self.metrics, templateId)) {
                        self.templateList[templateType].push(templateId);
                    } else {
                        console.log(`\t${chalk.yellow('Skipping')} ${templateType}-${templateId}, no metrics found for '${templateId}'.`);
                    }
                } else {
                    self.templateList[templateType].push(templateId);
                }
            }

            self.emit('templates.find.done');

        });
    }


    configGraphs() {
        console.log(chalk.blue(this.marker));

        const self = this;
        const graphs = self.templateList.graph;

        this.on('config.graph', this.configGraph);

        this.on('config.graph.next', () => {
            const graphId = graphs.shift();

            if (typeof graphId === 'undefined') {
                self.removeAllListeners('config.graph');
                self.removeAllListeners('config.graph.next');
                self.emit('graphs.config.done');
            } else {
                self.emit('config.graph', graphId);
            }
        });

        this.emit('config.graph.next');
    }


    configGraph(graphId) {
        assert.equal(typeof graphId, 'string', 'graphId is required');

        const templateFile = path.resolve(this.regDir, `template-graph-${graphId}.json`);
        const template = new Template(templateFile);

        console.log(`Preconfiguring graphs for ${graphId}`);
        console.log(`\tUsing template ${templateFile}`);

        for (let graphIdx = 0; graphIdx < template.graphs.length; graphIdx++) {
            if (template.variable_metrics) {
                this.configVariableGraph(template, graphIdx);
            } else {
                this.configStaticGraph(template, graphIdx);
            }
        }

        this.emit('config.graph.next');
    }


    configVariableGraph(template, graphIdx) {
        assert.equal(typeof template, 'object', 'template is required');
        assert.equal(typeof graphIdx, 'number', 'graphIdx is required');

        // get list of variable metric items required for graph with mapping
        // to actual metric name and graph datapoint offset
        const variableMetricList = this._getVariableMetrics(template, graphIdx);

        // create one graph for each distinct variable metric pattern matched (item)
        for (const item in variableMetricList) { // eslint-disable-line guard-for-in
            const configFile = path.resolve(
                this.regDir,
                `config-graph-${template.id}-${graphIdx}-${item.replace(/[^a-z0-9\-_]/ig, '_')}.json`
            );

            if (this._fileExists(configFile)) {
                console.log('\tGraph configuration already exists.', configFile);
            } else {
                const graphId = `${template.type}-${template.id}-${item}`;
                const graph = JSON.parse(JSON.stringify(template.graphs[graphIdx]));
                // const graph = Object.assign({}, template.graphs[graphIdx]);

                console.log(`\tCreating pre-config graph ${graphIdx} for ${template.id}.${item}`);

                // for (const metric of variableMetricList[item]) {
                for (let i = 0; i < variableMetricList[item].length; i++) {
                    const metric = variableMetricList[item][i];

                    graph.datapoints[metric.datapointIndex].metric_name = metric.name;
                }

                graph.notes = this.regConfig.cosiNotes;

                this._setTags(graph, graphId);
                this._setCustomGraphOptions(graph, graphId);

                const preConfigFile = configFile.replace('.json', '.pre.json');

                try {
                    fs.writeFileSync(
                        preConfigFile,
                        JSON.stringify(graph, null, 4),
                        { encoding: 'utf8', mode: 0o644, flag: 'w' }
                    );
                } catch (err) {
                    this.emit('error', err);
                    return;
                }

                console.log(chalk.green('\tSaved pre-config'), preConfigFile);
            }
        }
    }


    configStaticGraph(template, graphIdx) {
        assert.equal(typeof template, 'object', 'template is required');
        assert.equal(typeof graphIdx, 'number', 'graphIdx is required');

        const configFile = path.resolve(this.regDir, `config-graph-${template.id}-${graphIdx}.json`);

        if (this._fileExists(configFile)) {
            console.log('\tGraph configuration already exists.', configFile);
            return;
        }

        // const graph = Object.assign({}, template.graphs[graphIdx]);
        const graph = JSON.parse(JSON.stringify(template.graphs[graphIdx]));

        console.log(`\tCreating pre-config graph ${graphIdx} for ${template.id}`);

        graph.notes = this.regConfig.cosiNotes;

        const graphId = `${template.type}-${template.id}`;

        this._setTags(graph, graphId);
        this._setCustomGraphOptions(graph, graphId);

        const preConfigFile = configFile.replace('.json', '.pre.json');

        try {
            fs.writeFileSync(preConfigFile, JSON.stringify(graph, null, 4), { encoding: 'utf8', mode: 0o644, flag: 'w' });
        } catch (err) {
            this.emit('error', err);
            return;
        }

        console.log(chalk.green('\tSaved pre-config'), preConfigFile);

    }


    configSystemCheck() {
        const id = 'check-system';

        console.log(chalk.blue(this.marker));
        console.log(`Configuring Check (${id})`);

        const configFile = path.resolve(this.regDir, `config-${id}.json`);
        const templateFile = configFile.replace('config-', 'template-');

        if (this._fileExists(configFile)) {
            console.log('\tCheck configuration already exists.', configFile);
            this.emit('check.config.done');
            return;
        }

        // const checkMetrics = this._extractMetricsFromGraphConfigs();
        const template = new Template(templateFile);
        const check = template.check;

        check.type = this.agentCheckType;
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
            check.config.url = this.agentUrl;
        }

        // set the broker receiving for pulling metrics

        // add the activated metrics
        check.metrics = []; // checkMetrics;

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
        // this.checkMetrics = checkMetrics;
        this.emit('check.config.done');

    }


    configStatsdCheck() {
        const id = 'check-statsd';

        console.log(chalk.blue(this.marker));
        console.log(`Configuring Check (${id})`);

        if (!this.regConfig.statsd.enabled) {
            console.log('\tStatsD check disabled, skipping.');
            this.emit('statsd.config.done');
            return;
        }

        const configFile = path.resolve(this.regDir, `config-${id}.json`);
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


    configWorksheet() {
        const id = 'worksheet-system';

        console.log(chalk.blue(this.marker));
        console.log(`Configuring Worksheet (${id})`);

        const configFile = path.resolve(this.regDir, `config-${id}.json`);
        const templateFile = configFile.replace('config-', 'template-');

        if (this._fileExists(configFile)) {
            console.log('\tWorksheet configuration already exists', configFile);
            this.emit('worksheet.config.done');
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
            fs.writeFileSync(
                configFile,
                JSON.stringify(config, null, 4),
                { encoding: 'utf8', mode: 0o644, flag: 'w' });
        } catch (err) {
            this.emit('error', err);
            return;
        }

        console.log('\tSaved configuration', configFile);
        this.emit('worksheet.config.done');

    }

    _writeDashboardConfig(template, config, id, data, registeredGraphs, registeredCheck) { // eslint-disable-line max-params
        const configFile = path.resolve(this.regDir, `config-${id}.json`);
        const self = this;
        // const check_dirty = false;
        const checkMetrics = [];

        if (this._fileExists(configFile)) {
            console.log('\tDashboard configuration already exists', configFile);
            this.emit('dashboard.config.done', configFile);
            return;
        }

        config.title = self._expand(config.title, data); // eslint-disable-line no-param-reassign

        // for (const widget of config.widgets)
        for (let i = config.widgets.length - 1; i >= 0; i--) {
            const widget = config.widgets[i];

            if (widget.name === 'Graph') {
                /* find the matching graph based on tags in registeredGraphs */
                let found_graph = false;

                for (let gi = 0; gi < registeredGraphs.length; gi++) {
                    const graph = registeredGraphs[gi];

                    if (graph && graph.tags && graph.tags.length > 0) {
                        for (let j = 0; j < widget.tags.length; j++) {
                            if (graph.tags.indexOf(widget.tags[j]) !== -1) { // eslint-disable-line max-depth
                                /* need to fill the account_id and graph_id fields */
                                widget.settings._graph_title = self._expand(widget.settings._graph_title, data);
                                widget.settings.account_id = this.regConfig.account.account_id;
                                widget.settings.graph_id = graph._cid.replace('/graph/', '');
                                widget.settings.label = self._expand(widget.settings.label, data);
                                /* tags property is just used to match widgets to graphs, remove before submission */
                                delete widget.tags;
                                widget.type = 'graph';
                                found_graph = true;
                                break;
                            }
                        }
                        if (found_graph) {
                            break;
                        }
                    }
                }
                if (found_graph === false) {
                    console.log(chalk.yellow('WARN'), 'Could not find matching graph for:', JSON.stringify(widget.tags));
                    /* pull this graph out of the dashboard */
                    config.widgets.splice(i, 1);
                }
            } else if (widget.name === 'Gauge') {
                /* find the matching metric on this system */
                const metric_name = self._expand(widget.settings.metric_name, data);
                let metric = null;

                widget.settings.metric_name = metric_name;

                if (metric_name.search('`') === -1) {
                    if ({}.hasOwnProperty.call(this.metrics, metric_name)) {
                        metric = this.metrics[metric_name];
                    } else {
                        console.log(chalk.yellow('WARN'), `No active metric found for ${metric_name}`);
                        config.widgets.splice(i, 1);
                    }
                } else {
                    const mg = metric_name.split('`')[0];

                    if ({}.hasOwnProperty.call(this.metrics, mg)) {
                        const metric_group = this.metrics[mg];
                        const mn = metric_name.replace(`${mg}\``, '');

                        if ({}.hasOwnProperty.call(metric_group, mn)) {
                            metric = metric_group[mn];
                        } else {
                            console.log(chalk.yellow('WARN'), `No active metric ${mn} found in metric group ${mg}`);
                        }
                    } else {
                        console.log(chalk.yellow('WARN'), `No active metric group found ${mg}`);
                    }
                }

                if (metric === null) {
                    console.log(chalk.yellow('WARN'), 'No metrics found for', widget.name);
                    config.widgets.splice(i, 1);
                } else {
                    /* need to ensure the needed metric is active in the check */
                    checkMetrics.push({
                        name: metric_name,
                        type: metric._type === 's' ? 'text' : 'numeric',
                        status: 'active'
                    });
                    widget.settings.account_id = this.regConfig.account.account_id;
                    widget.settings.check_uuid = registeredCheck._check_uuids[0];
                    widget.settings.type = widget.settings._type;
                    widget.type = 'gauge';
                }
            }
        }

        try {
            fs.writeFileSync(
                configFile,
                JSON.stringify(config, null, 4),
                { encoding: 'utf8', mode: 0o644, flag: 'w' });
        } catch (err) {
            this.emit('error', err);
            return;
        }
        console.log('\tSaved configuration', configFile);

        this.resaveCheck(registeredCheck, checkMetrics);

        this.emit('dashboard.config.done', configFile);
    }

    resaveCheck(registeredCheck, extraMetrics) {
        const self = this;

        const checkMetrics = this._extractMetricsFromGraphConfigs();

        if (extraMetrics) {
            extraMetrics.forEach((item) => {
                checkMetrics.push(item);
            });
        }
        registeredCheck.metrics = checkMetrics; // eslint-disable-line no-param-reassign

        /* re-save the check config since it changed */
        const checkConfigFile = path.resolve(this.regDir, 'config-check-system.json');

        fs.writeFileSync(
            checkConfigFile,
            JSON.stringify(registeredCheck, null, 4),
            { encoding: 'utf8', mode: 0o644, flag: 'w' }
        );

        const regFile = path.resolve(this.regDir, 'registration-check-system.json');

        const check = new Check(checkConfigFile);

        console.log('\tSending altered check configuration to Circonus API');
        check.update((err) => {
            if (err) {
                self.emit('error', `Cannot re-save check config "${err}"`);
                return;
            }
            console.log(`\tSaving registration ${regFile}`);
            check.save(regFile, true);
        });
    }

    configDashboard(name, dashboard_items) {
        const id = `dashboard-${name}`;
        const self = this;

        console.log(chalk.blue(this.marker));
        console.log(`Configuring Dashboard (${id})`);

        const templateFile = path.resolve(this.regDir, `template-${id}.json`);

        if (!this._fileExists(templateFile)) {
            console.log('\tNo template for dashboard', templateFile);
            return;
        }

        const template = require(templateFile);
        const config = template.config;
        const registeredGraphs = [];

        /* read all the registered graphs because the dashboard might need
           graph UUID's */
        const files = fs.readdirSync(self.regDir);

        for (let i = 0; i < files.length; i++) {
            const file = files[i];

            if (file.match(/^registration-graph-([^.]+)+\.json?$/)) {
                try {
                    const configFile = path.resolve(this.regDir, file);
                    const graph = require(configFile);

                    registeredGraphs.push(graph);
                } catch (err) {
                    this.emit('error', err);
                }
            }
        }

        const registeredCheck = require(path.resolve(this.regDir, 'registration-check-system.json'));

        for (let di = 0; di < dashboard_items.length; di++) {
            const item = dashboard_items[di];
            const data = this.regConfig.templateData;

            data.dashboard_item = item;
            this._writeDashboardConfig(template, config, `${id}-${item}`, data,
                                       registeredGraphs, registeredCheck);
        }
    }


    /* eslint-disable max-depth */
    _getVariableMetrics(template, graphIdx) {
        assert.equal(typeof template, 'object', 'template is required');
        assert.equal(typeof graphIdx, 'number', 'graphIdx is required');

        // flat list of full metric names metric_group`metric_name (fs`/sys/fs/cgroup`df_used_percent)
        const metrics = Object.keys(this.metrics[template.id]).map((val) => {
            return `${template.id}\`${val}`;
        });

        const variableMetrics = {};

        // cherry pick metrics actually needed
        for (let dpIdx = 0; dpIdx < template.graphs[graphIdx].datapoints.length; dpIdx++) {
            const dp = template.graphs[graphIdx].datapoints[dpIdx];             // "metric_name": "fs`([^`]+)`df_used_percent"

            // for (const metric of metrics) {
            for (let metricIdx = 0; metricIdx < metrics.length; metricIdx++) {
                const metric = metrics[metricIdx];
                const parts = metric.match(dp.metric_name);                     // 'fs`/sys/fs/cgroup`df_used_percent'.match(/fs`([^`]+)`df_used_percent/)

                if (parts) {
                    const item = parts[1];                                      // eg /sys/fs/cgroup
                    let keepMetric = true;                                      // default, keep all metrics

                    if (template.filter) {                                      // apply filters, if configured in template
                        if (template.filter.include && Array.isArray(template.filter.include)) {
                            keepMetric = false;
                            // for (const filter of template.filter.include) {
                            for (let filterIdx = 0; filterIdx < template.filter.include.length; filterIdx++) {
                                const filter = template.filter.include[filterIdx];

                                if (item.match(filter) !== null) {
                                    keepMetric = true;
                                    break;
                                }
                            }
                        }

                        if (keepMetric && template.filter.exclude && Array.isArray(template.filter.exclude)) {
                            // for (const filter of template.filter.exclude) {
                            for (let filterIdx = 0; filterIdx < template.filter.exclude.length; filterIdx++) {
                                const filter = template.filter.exclude[filterIdx];

                                if (item.match(filter) !== null) {
                                    keepMetric = false;
                                    break;
                                }
                            }
                        }
                    }

                    if (keepMetric) {
                        if (!variableMetrics[item]) {
                            variableMetrics[item] = [];
                        }
                        variableMetrics[item].push({
                            name: metric,
                            datapointIndex: `${dpIdx}`
                        });
                    }
                }
            }
        }

        return variableMetrics;
    }
    /* eslint-enable max-depth */


    /* eslint-disable xno-param-reassign */
    _setCustomGraphOptions(cfg, id) {
        assert.equal(typeof cfg, 'object', 'cfg is required');
        assert.equal(typeof id, 'string', 'id is required');

        console.log('\tApplying custom config options and interpolating templates');

        const idParts = id.split('-', 3);
        const options = [
            'title',
            'description'
        ];

        if (idParts.length >= 2) {
            const cfgType = idParts[0];
            const cfgId = idParts[1];
            const cfgItem = idParts.length === 3 ? idParts[2] : null;

            if ({}.hasOwnProperty.call(this.customOptions, cfgType)) {
                const custom = this.customOptions[cfgType];

                // for (const opt of options) {
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

                    if ({}.hasOwnProperty.call(custom[cfgId], cfgItem)) {
                        for (let i = 0; i < options.length; i++) {
                            const opt = options[i];

                            if ({}.hasOwnProperty.call(custom[cfgId][cfgItem], opt)) { // eslint-disable-line max-depth
                                console.log(`\tSetting ${opt} to ${custom[cfgId][cfgItem][opt]}`);
                                cfg[opt] = custom[cfgId][cfgItem][opt]; // eslint-disable-line no-param-reassign
                            }
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

        // expand templats in C:AQL statements
        // for (const dp of cfg.datapoints) {
        for (let dpIdx = 0; dpIdx < cfg.datapoints.length; dpIdx++) {
            const dp = cfg.datapoints[dpIdx];

            if (dp.metric_name === null && dp.caql !== null) {
                cfg.datapoints[dpIdx].caql = this._expand(dp.caql, data); // eslint-disable-line no-param-reassign
            }
        }

        // set guide for graph-load template (uses #cpus)
        if (id === 'graph-load' && cfg.guides.length > 0) {
            for (let i = 0; i < cfg.guides.length; i++) {
                if (cfg.guides[i].data_formula.indexOf('{{') !== -1) {
                    console.log(`\tInterpolating data_formula ${cfg.guides[i].data_formula} of ${cfg.guides[i].name} guide`);
                    cfg.guides[i].data_formula = this._expand(cfg.guides[i].data_formula, data); // eslint-disable-line no-param-reassign
                }
            }
        }
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

            if ({}.hasOwnProperty.call(this.customOptions, cfgType)) {
                const custom = this.customOptions[cfgType];

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
    }


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

            if ({}.hasOwnProperty.call(this.customOptions, cfgType)) {
                const custom = this.customOptions[cfgType];

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
    }

}

module.exports = Config;

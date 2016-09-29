'use strict';

/* eslint-env node, es6 */
/* eslint-disable no-magic-numbers, global-require, camelcase */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const chalk = require('chalk');

const cosi = require(path.resolve(path.join(__dirname, '..', '..', '..', 'cosi')));
const Registration = require(path.resolve(path.join(cosi.lib_dir, 'registration')));
const Checks = require(path.resolve(path.join(cosi.lib_dir, 'registration', 'checks')));
const Template = require(path.resolve(path.join(cosi.lib_dir, 'template')));
const templateList = require(path.resolve(path.join(cosi.lib_dir, 'template', 'list')));
const Graph = require(path.resolve(path.join(cosi.lib_dir, 'graph')));

class Graphs extends Registration {

    constructor(quiet) {
        super(quiet);

        const err = this.loadRegConfig();

        if (err !== null) {
            this.emit('error', err);
            return;
        }

        this.metrics = null;
        this.templates = null;
        this.checkMeta = null;
    }

    create(cb) {
        console.log(chalk.bold('\nRegistration - graphs'));

        const self = this;

        this.once('checks.load', () => {
            console.log(chalk.blue(this.marker));
            console.log('Loading check meta data');

            const checks = new Checks();

            self.checkMeta = checks.getMeta();
            if (self.checkMeta === null) {
                self.emit('error', new Error('Unable to load check meta data'));
            }
            console.log(chalk.green('Loaded'), 'check meta data');
            self.emit('metrics.load');
        });

        this.once('metrics.load', this.loadMetrics);
        this.once('metrics.load.done', () => {
            self.emit('templates.find');
        });

        this.once('templates.find', this.findTemplates);
        this.once('templates.find.done', () => {
            if (self.templates.length < 1) {
                self.emit('error', new Error('No graph templates identified'));
                return;
            }
            self.emit('graphs.config');
        });

        this.once('graphs.config', this.configGraphs);
        this.once('graphs.config.done', () => {
            self.emit('graphs.create');
        });

        this.once('graphs.create', this.createGraphs);
        this.once('graphs.create.done', () => {
            self.emit('graphs.finalize');
        });

        this.once('graphs.finalize', () => {
            // noop at this point
            self.emit('graphs.done');
        });

        this.once('graphs.done', () => {
            if (typeof cb === 'function') {
                cb();
                return;
            }
        });

        this.emit('checks.load');
    }


    findTemplates() {
        console.log(chalk.blue(this.marker));
        console.log('Identifying graph templates');

        const self = this;

        templateList(cosi.reg_dir, (listError, templates) => {
            if (listError) {
                self.emit('error', listError);
                return;
            }

            self.templates = [];

            // for (const template of templates) {
            for (let i = 0; i < templates.length; i++) {
                const template = templates[i];
                const templateType = template.config.type;
                const templateId = template.config.id;

                if (templateType !== 'graph') {
                    continue;
                }

                console.log(`\tFound ${templateType}-${templateId} ${template.file}`);

                if ({}.hasOwnProperty.call(self.metrics, templateId)) {
                    self.templates.push(templateId);
                } else {
                    console.log(`\t${chalk.yellow('Skipping')} ${templateType}-${templateId}, no metrics found for '${templateId}'.`);
                }
            }

            self.emit('templates.find.done');
        });
    }


    configGraphs() {
        console.log(chalk.blue(this.marker));

        const self = this;
        const graphs = this.templates;

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

        const templateFile = path.resolve(path.join(cosi.reg_dir, `template-graph-${graphId}.json`));
        const template = new Template(templateFile);

        console.log(`Configuring graphs for ${graphId}`);
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
            const cfgFile = path.resolve(
                cosi.reg_dir,
                `config-graph-${template.id}-${graphIdx}-${item.replace(/[^a-z0-9\-_]/ig, '_')}.json`
            );

            if (this._fileExists(cfgFile)) {
                console.log('\tGraph configuration already exists.', cfgFile);
                continue;
            }

            const graphId = `${template.type}-${template.id}-${item}`;
            const graph = JSON.parse(JSON.stringify(template.graphs[graphIdx]));
            // const graph = Object.assign({}, template.graphs[graphIdx]);

            console.log(`\tCreating graph ${graphIdx} config for ${template.id}.${item}`);

            // for (const metric of variableMetricList[item]) {
            for (let i = 0; i < variableMetricList[item].length; i++) {
                const metric = variableMetricList[item][i];

                graph.datapoints[metric.datapointIndex].metric_name = metric.name;
            }

            for (let i = 0; i < graph.datapoints.length; i++) {
                graph.datapoints[i].check_id = this.checkMeta.system.id;
            }

            graph.notes = this.regConfig.cosiNotes;

            this._setTags(graph, graphId);
            this._setCustomGraphOptions(graph, graphId);

            try {
                fs.writeFileSync(cfgFile, JSON.stringify(graph, null, 4), { encoding: 'utf8', mode: 0o644, flag: 'w' });
            } catch (err) {
                this.emit('error', err);
                return;
            }

            console.log(chalk.green('\tSaved config'), cfgFile);
        }
    }


    configStaticGraph(template, graphIdx) {
        assert.equal(typeof template, 'object', 'template is required');
        assert.equal(typeof graphIdx, 'number', 'graphIdx is required');

        const cfgFile = path.resolve(path.join(cosi.reg_dir, `config-graph-${template.id}-${graphIdx}.json`));

        if (this._fileExists(cfgFile)) {
            console.log('\tGraph configuration already exists.', cfgFile);
            return;
        }

        // const graph = Object.assign({}, template.graphs[graphIdx]);
        const graph = JSON.parse(JSON.stringify(template.graphs[graphIdx]));

        console.log(`\tCreating graph ${graphIdx} config for ${template.id}`);

        graph.notes = this.regConfig.cosiNotes;

        const graphId = `${template.type}-${template.id}`;

        for (let i = 0; i < graph.datapoints.length; i++) {
            graph.datapoints[i].check_id = this.checkMeta.system.id;
        }

        this._setTags(graph, graphId);
        this._setCustomGraphOptions(graph, graphId);

        try {
            fs.writeFileSync(cfgFile, JSON.stringify(graph, null, 4), { encoding: 'utf8', mode: 0o644, flag: 'w' });
        } catch (err) {
            this.emit('error', err);
            return;
        }

        console.log(chalk.green('\tSaved config'), cfgFile);

    }

    createGraphs() {
        const self = this;
        const graphConfigs = [];

        try {
            const files = fs.readdirSync(cosi.reg_dir);

            for (let i = 0; i < files.length; i++) {
                const file = files[i];

                if (file.match(/^config-graph-/)) {
                    graphConfigs.push(path.resolve(path.join(cosi.reg_dir, file)));
                }
            }
        } catch (err) {
            this.emit('error', err);

            return;
        }

        this.on('create.graph', this.createGraph);

        this.on('create.graph.next', () => {
            const configFile = graphConfigs.shift();

            if (typeof configFile === 'undefined') {
                self.removeAllListeners('create.graph');
                self.removeAllListeners('create.graph.next');
                self.emit('graphs.done');
            } else {
                self.emit('create.graph', configFile);
            }
        });

        this.emit('create.graph.next');
    }


    createGraph(cfgFile) {
        assert.strictEqual(typeof cfgFile, 'string', 'cfgFile is required');

        console.log(chalk.blue(this.marker));
        console.log('Creating graph', cfgFile);

        // if (graph.isPreConfig()) {
        //     console.log(`\tUpdating pre-config with check ID ${this.checkId} and check uuid: ${this.checkUuid}`);
        //
        //     cfgFile = configFile.replace('.pre', '');
        //     graph.preToConfig(this.checkId, this.checkUuid);
        //
        //     console.log('\tSaving config', cfgFile);
        //     try {
        //         graph.save(cfgFile);
        //     } catch (err) {
        //         this.emit('error', err);
        //         return;
        //     }
        //
        //     console.log('\tRemoving pre-config', configFile);
        //     try {
        //         fs.unlinkSync(configFile);
        //     } catch (err) {
        //         this.emit('error', err);
        //         return;
        //     }
        // }

        const regFile = cfgFile.replace('config-', 'registration-');

        if (this._fileExists(regFile)) {
            console.log(chalk.bold('\tRegistration exists'), `using ${regFile}`);
            this.emit('create.graph.next');
            return;
        }

        console.log('\tSending graph configuration to Circonus API');

        const graph = new Graph(cfgFile);
        const self = this;

        graph.create((err) => {
            if (err) {
                self.emit('error', err);
                return;
            }

            console.log(`\tSaving registration ${regFile}`);
            graph.save(regFile);

            console.log(chalk.green('\tGraph created:'), `${self.regConfig.account.ui_url}/trending/graphs/view/${graph._cid.replace('/graph/', '')}`);
            self.emit('create.graph.next');
        });
    }


    /*

    Utility methods

    */


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

            if ({}.hasOwnProperty.call(cosi.custom_options, cfgType)) {
                const custom = cosi.custom_options[cfgType];

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

            if ({}.hasOwnProperty.call(dp, 'caql')) {
                if (dp.metric_name === null && dp.caql !== null) {
                    console.log(`\tInterpolating C:AQL statement ${dp.caql} for metric ${dp.metric_name}`);
                    cfg.datapoints[dpIdx].caql = this._expand(dp.caql, data); // eslint-disable-line no-param-reassign
                }
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

        // expand tags
        for (let i = 0; i < cfg.tags.length; i++) {
            if (cfg.tags[i].indexOf('{{') !== -1) {
                console.log(`\tInterpolating tag ${cfg.tags[i]}`);
                cfg.tags[i] = this._expand(cfg.tags[i], data); // eslint-disable-line no-param-reassign
            }
        }
    }


}

module.exports = Graphs;

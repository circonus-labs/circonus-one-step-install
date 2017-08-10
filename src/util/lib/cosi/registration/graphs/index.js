// Copyright 2016 Circonus, Inc. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

'use strict';

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

    /**
     * create graph object
     * @arg {Boolean} quiet squelch some info messages
     */
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

    /**
     * start the graph creation process
     * @returns {Object} promise
     */
    create() {
        return new Promise((resolve, reject) => {
            console.log(chalk.bold('\nRegistration - graphs'));

            this.loadCheckMeta().
                then(() => {
                    return this.loadMetrics();
                }).
                then(() => {
                    return this.findTemplates();
                }).
                then(() => {
                    if (this.templates.length < 1) {
                        reject(new Error('No graph templates found'));

                        return null;
                    }

                    return this.configGraphs();
                }).
                then(() => {
                    return this.createGraphs();
                }).
                then(() => {
                    return this.finalizeGraphs();
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
     * load check meta data
     * @returns {Object} promise
     */
    loadCheckMeta() {
        return new Promise((resolve, reject) => {
            console.log(chalk.blue(this.marker));
            console.log('Loading check meta data');

            const checks = new Checks();

            this.checkMeta = checks.getMeta();
            if (this.checkMeta === null) {
                reject(new Error('Unable to load check meta data'));

                return;
            }
            console.log(chalk.green('Loaded'), 'check meta data');
            resolve();
        });
    }


    /**
     * find graph templates
     * @returns {Object} promise
     */
    findTemplates() {
        return new Promise((resolve, reject) => {
            console.log(chalk.blue(this.marker));
            console.log('Identifying graph templates');

            templateList(cosi.reg_dir).
                then((templates) => {
                    this.templates = [];

                    for (const template of templates) {
                        const templateType = template.config.type;
                        const templateId = template.config.id;

                        if (templateType !== 'graph') {
                            continue;
                        }

                        console.log(`\tFound ${templateType}-${templateId} ${template.file}`);

                        if ({}.hasOwnProperty.call(this.metrics, templateId)) {
                            this.templates.push(templateId);
                        } else {
                            console.log(`\t${chalk.yellow('Skipping')} ${templateType}-${templateId}, no metrics found for '${templateId}'.`);
                        }
                    }
                    resolve();
                }).
                catch((err) => {
                    reject(err);
                });
        });
    }


    /**
     * configure graphs
     * @returns {Object} promise
     */
    configGraphs() {
        return new Promise((resolve, reject) => {
            console.log(chalk.blue(this.marker));

            const graphs = this.templates;

            this.on('config.graph.next', () => {
                const graphId = graphs.shift();

                if (typeof graphId === 'undefined') {
                    this.removeAllListeners('config.graph.next');
                    resolve();

                    return;
                }

                this.configGraph(graphId).
                    then(() => {
                        this.emit('config.graph.next');
                    }).
                    catch((err) => {
                        reject(err);
                    });
            });

            this.emit('config.graph.next');
        });
    }


    /**
     * configure individual, specific graph
     * @arg {String} graphId to configure
     * @returns {Undefined} nothing, emits event
     */
    configGraph(graphId) {
        assert.equal(typeof graphId, 'string', 'graphId is required');

        return new Promise((resolve) => {
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

            resolve();
        });
    }


    /**
     * configure specific variable graph
     * @arg {Object} template of graphs to configure
     * @arg {Number} graphIdx of specific graph to configure
     * @returns {Undefined} nothing, emits event
     */
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

            console.log(`\tCreating graph ${graphIdx} config for ${template.id}.${item}`);

            for (const metric of variableMetricList[item]) {
                graph.datapoints[metric.datapointIndex].metric_name = metric.name;
            }

            for (let i = 0; i < graph.datapoints.length; i++) {
                graph.datapoints[i].check_id = this.checkMeta.system.id;
            }

            graph.notes = this.regConfig.cosiNotes;

            this._setTags(graph, graphId);
            this._setCustomGraphOptions(graph, graphId);

            try {
                fs.writeFileSync(cfgFile, JSON.stringify(graph, null, 4), {
                    encoding : 'utf8',
                    flag     : 'w',
                    mode     : 0o644
                });
            } catch (err) {
                this.emit('error', err);

                return;
            }

            console.log(chalk.green('\tSaved config'), cfgFile);
        }
    }


    /**
     * configure specific static graph
     * @arg {Object} template of graphs to configure
     * @arg {Number} graphIdx of specific graph to configure
     * @returns {Undefined} nothing, emits event
     */
    configStaticGraph(template, graphIdx) {
        assert.equal(typeof template, 'object', 'template is required');
        assert.equal(typeof graphIdx, 'number', 'graphIdx is required');

        const cfgFile = path.resolve(path.join(cosi.reg_dir, `config-graph-${template.id}-${graphIdx}.json`));

        if (this._fileExists(cfgFile)) {
            console.log('\tGraph configuration already exists.', cfgFile);

            return;
        }

        const graph = JSON.parse(JSON.stringify(template.graphs[graphIdx]));

        console.log(`\tCreating graph ${graphIdx} config for ${template.id}`);

        if (graph.notes === null) {
            graph.notes = this.regConfig.cosiNotes;
        }

        const graphId = `${template.type}-${template.id}`;

        for (let i = 0; i < graph.datapoints.length; i++) {
            graph.datapoints[i].check_id = this.checkMeta.system.id;
        }

        this._setTags(graph, graphId);
        this._setCustomGraphOptions(graph, graphId);

        try {
            fs.writeFileSync(cfgFile, JSON.stringify(graph, null, 4), {
                encoding : 'utf8',
                flag     : 'w',
                mode     : 0o644
            });
        } catch (err) {
            this.emit('error', err);

            return;
        }

        console.log(chalk.green('\tSaved config'), cfgFile);
    }

    /**
     * managing creating all graphs
     * @returns {Object} promise
     */
    createGraphs() {
        return new Promise((resolve, reject) => {
            const self = this;
            const graphConfigs = [];

            try {
                const files = fs.readdirSync(cosi.reg_dir);

                for (const file of files) {
                    if (file.match(/^config-graph-/)) {
                        graphConfigs.push(path.resolve(path.join(cosi.reg_dir, file)));
                    }
                }
            } catch (err) {
                reject(err);

                return;
            }

            this.on('create.graph.next', () => {
                const configFile = graphConfigs.shift();

                if (typeof configFile === 'undefined') {
                    self.removeAllListeners('create.graph');
                    self.removeAllListeners('create.graph.next');
                    resolve();

                    return;
                }

                self.createGraph(configFile).
                    then(() => {
                        this.emit('create.graph.next');
                    }).
                    catch((err) => {
                        reject(err);
                    });
            });

            this.emit('create.graph.next');
        });
    }

    /**
     * finalize graphs
     * @returns {Object} promise
     */
    finalizeGraphs() { // eslint-disable-line class-methods-use-this
        // NOP for now
        return Promise.resolve();
    }

    /**
     * create specific graph
     * @arg {String} cfgFile for graph
     * @returns {Object} promise
     */
    createGraph(cfgFile) {
        assert.strictEqual(typeof cfgFile, 'string', 'cfgFile is required');

        return new Promise((resolve, reject) => {
            console.log(chalk.blue(this.marker));
            console.log('Creating graph', cfgFile);

            const regFile = cfgFile.replace('config-', 'registration-');

            if (this._fileExists(regFile)) {
                console.log(chalk.bold('\tRegistration exists'), `using ${regFile}`);
                resolve();

                return;
            }

            console.log('\tSending graph configuration to Circonus API');

            const graph = new Graph(cfgFile);

            graph.create().
                then(() => {
                    console.log(`\tSaving registration ${regFile}`);
                    graph.save(regFile);

                    console.log(chalk.green('\tGraph created:'), `${this.regConfig.account.ui_url}/trending/graphs/view/${graph._cid.replace('/graph/', '')}`);
                    resolve();
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
     * collect variable metrics for a graph
     * @arg {Object} template defining graph(s)
     * @arg {Number} graphIdx of specific graph
     * @returns {Undefined} nothing, emits event
     */
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

            for (const metric of metrics) {
                const parts = metric.match(dp.metric_name);                     // 'fs`/sys/fs/cgroup`df_used_percent'.match(/fs`([^`]+)`df_used_percent/)

                if (parts) {
                    const item = parts[1];                                      // eg /sys/fs/cgroup
                    let keepMetric = true;                                      // default, keep all metrics

                    if (template.filter) {                                      // apply filters, if configured in template
                        if (template.filter.include && Array.isArray(template.filter.include)) { // eslint-disable-line max-depth
                            keepMetric = false;
                            for (const filter of template.filter.include) { // eslint-disable-line max-depth
                                if (item.match(filter) !== null) { // eslint-disable-line max-depth
                                    keepMetric = true;
                                    break;
                                }
                            }
                        }

                        if (keepMetric && template.filter.exclude && Array.isArray(template.filter.exclude)) { // eslint-disable-line max-depth, max-len
                            for (const filter of template.filter.exclude) { // eslint-disable-line max-depth
                                if (item.match(filter) !== null) { // eslint-disable-line max-depth
                                    keepMetric = false;
                                    break;
                                }
                            }
                        }
                    }

                    if (keepMetric) {
                        if (!variableMetrics[item]) { // eslint-disable-line max-depth
                            variableMetrics[item] = [];
                        }
                        variableMetrics[item].push({
                            datapointIndex : `${dpIdx}`,
                            name           : metric
                        });
                    }
                }
            }
        }

        return variableMetrics;
    }


    /**
     * set custom options for graph
     * @arg {Object} cfg for graph
     * @arg {String} id for graph (to find custom options)
     * @returns {Undefined} nothing
     */
    _setCustomGraphOptions(cfg, id) { // eslint-disable-line complexity
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

                for (const opt of options) {
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

                    if ({}.hasOwnProperty.call(custom[cfgId], cfgItem)) {
                        for (const opt of options) { // eslint-disable-line max-depth
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

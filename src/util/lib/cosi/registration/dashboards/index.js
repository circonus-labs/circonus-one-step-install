// Copyright 2016 Circonus, Inc. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

'use strict';

const fs = require('fs');
const path = require('path');

const chalk = require('chalk');

const cosi = require(path.resolve(path.resolve(__dirname, '..', '..', '..', 'cosi')));
const Registration = require(path.resolve(cosi.lib_dir, 'registration'));
const Checks = require(path.resolve(cosi.lib_dir, 'registration', 'checks'));
// const Template = require(path.join(cosi.lib_dir, 'template'));
const templateList = require(path.join(cosi.lib_dir, 'template', 'list'));
const Dashboard = require(path.resolve(cosi.lib_dir, 'dashboard'));
const Graph = require(path.resolve(cosi.lib_dir, 'graph'));
const api = require(path.resolve(cosi.lib_dir, 'api'));

class Dashboards extends Registration {

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

        this.templates = null;
        this.graphs = null;
        this.checksMeta = null;
        this.metrics = null;
    }

    /**
     * start the dashboard creation process
     * @returns {Object} promise
     */
    create() {
        return new Promise((resolve, reject) => {
            console.log(chalk.bold('\nRegistration - dashboards'));

            this.findTemplates().
                then(() => {
                    if (this.templates.length === 0) {
                        // this is benign, we can't reject it.
                        // there are no *required* dashboards
                        console.log(chalk.yellow('WARN'), 'No dashboard templates found');
                        console.log(chalk.green('\nSKIPPING'), 'dasbhoards, none found to register');

                        return null;
                    }

                    return this.processTemplates();
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
     * process dashboard templates
     * @returns {Object} promise
     */
    processTemplates() {
        return new Promise((resolve, reject) => {
            this.loadCheckMeta().
                then(() => {
                    return this.loadMetrics();
                }).
                then(() => {
                    return this.loadGraphs();
                }).
                then(() => {
                    return this.configDashboards();
                }).
                then(() => {
                    return this.createDashboards();
                }).
                then(() => {
                    return this.finalizeDashboards();
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
     * find dashboard templates
     * @returns {Undefined} nothing, emits event
     */
    findTemplates() {
        return new Promise((resolve, reject) => {
            console.log(chalk.blue(this.marker));
            console.log('Identifying dashboard templates');

            templateList(cosi.reg_dir).
                then((templates) => {
                    this.templates = [];

                    for (const template of templates) {
                        const templateType = template.config.type;
                        const templateId = template.config.id;

                        if (templateType !== 'dashboard') {
                            continue;
                        }

                        console.log(`\tFound ${templateType}-${templateId} ${template.file}`);
                        this.templates.push(template);
                    }

                    console.log(chalk.green('Loaded'), `${this.templates.length} template(s)`);
                    resolve();
                }).
                catch((err) => {
                    reject(err);
                });
        });
    }


    /**
     * load existing graphs
     * @returns {Object} promise
     */
    loadGraphs() {
        return new Promise((resolve, reject) => {
            console.log(chalk.blue(this.marker));
            console.log('Loading graphs');

            this.graphs = [];

            const fileList = fs.readdirSync(cosi.reg_dir);

            for (const file of fileList) {
                if (file.match(/^registration-graph-/)) {
                    console.log(`\tExtracting meta data from ${file}`);
                    const graphCfgFile = path.resolve(path.join(cosi.reg_dir, file));
                    const graph = new Graph(graphCfgFile);

                    this.graphs.push({
                        id            : graph._cid.replace('/graph/', ''),
                        instance_name : path.basename(file, '.json').replace(/^registration-graph-/, ''),
                        tags          : graph.tags.join(',')
                    });
                }
            }

            if (this.graphs === null || this.graphs.length === 0) {
                reject(new Error('Unable to load meta data for graphs'));

                return;
            }

            console.log(chalk.green('Loaded'), `meta data from ${this.graphs.length} graphs`);
            resolve();
        });
    }


    /**
     * configure dasbhoards
     * @returns {Object} promise
     */
    configDashboards() {
        return new Promise((resolve, reject) => {
            const dashboards = this.templates;

            console.log(chalk.bold(`Configuring dasbhoards`), `for ${this.templates.length} template(s)`);

            this.on('config.dashboard.next', () => {
                const template = dashboards.shift();

                if (typeof template === 'undefined') {
                    this.removeAllListeners('config.dashboard.next');
                    resolve();

                    return;
                }

                this.configDashboard(template).
                    then(() => {
                        this.emit('config.dashboard.next');
                    }).
                    catch((err) => {
                        reject(err);
                    });
            });

            this.emit('config.dashboard.next');
        });
    }


    /**
     * configure individual dashboard
     * @arg {Object} template to base configuration on
     * @returns {Object} promise
     */
    configDashboard(template) {
        return new Promise((resolve, reject) => { // eslint-disable-line complexity, max-statements
            console.log(chalk.blue(this.marker));
            console.log(`Configuring dasbhoard`);

            const templateMatch = template.file.match(/^template-dashboard-([^-]+)(?:-(.*))?\.json$/);

            if (templateMatch === null) {
                reject(new Error(`Invalid template, no instance found. ${template.file}`));

                return;
            }

            const dashboardInstance = templateMatch[2] || 0;
            const dashboardID = `${templateMatch[1]}-${dashboardInstance}`;
            const templateFile = path.resolve(path.join(cosi.reg_dir, template.file));
            const configFile = templateFile.replace('template-', 'config-');

            console.log(`\tDashboard: ${dashboardID} (${templateFile})`);

            if (this._fileExists(configFile)) {
                console.log(chalk.bold('\tConfiguration exists'), `- using ${configFile}`);
                resolve();

                return;
            }

            const metaFile = path.resolve(path.join(cosi.reg_dir, `meta-dashboard-${dashboardID}.json`));
            let metaData = { sys_graphs: [] };

            console.log(`\tUsing meta data from ${metaFile}`);

            if (this._fileExists(metaFile)) {
                try {
                    metaData = require(metaFile); // eslint-disable-line global-require
                    if (!{}.hasOwnProperty.call(metaData, 'sys_graphs')) {
                        metaData.sys_graphs = [];
                    }
                } catch (err) {
                    if (err.code !== 'MODULE_NOT_FOUND') {
                        reject(err);

                        return;
                    }
                }
            }

            for (let i = 0; i < metaData.sys_graphs.length; i++) {
                metaData.sys_graphs[i].instance_name = [
                    metaData.sys_graphs[i].metric_group,
                    metaData.sys_graphs[i].graph_instance === null ? 0 : metaData.sys_graphs[i].graph_instance,
                    metaData.sys_graphs[i].metric_item
                ].join('-');
            }

            const config = JSON.parse(JSON.stringify(template.config.config));
            let data = null;

            data = this._mergeData(`dashboard-${dashboardID}`);
            data.dashboard_instance = dashboardInstance;
            if ({}.hasOwnProperty.call(metaData, 'vars')) {
                for (const dataVar in metaData.vars) { // eslint-disable-line guard-for-in
                    data[dataVar] = metaData.vars[dataVar];
                }
            }

            console.log(`\tInterpolating title ${config.title}`);
            config.title = this._expand(config.title, data);

            let missing_widgets = 0;

            console.log(`\tConfiguring graph widgets`);
            config.widgets = config.widgets.map((widget) => {
                if (widget.type !== 'graph') {
                    return widget; // pass on unchanged
                }

                const graphIdx = this._findWidgetGraph(widget, metaData);

                if (graphIdx === -1) {
                    console.log(chalk.yellow('\tWARN'), 'No graph found for', widget.widget_id, 'with tag', widget.tags);
                    missing_widgets += 1;

                    return false; // delete from list
                }

                // configure widget
                widget.settings.graph_id = this.graphs[graphIdx].id; // eslint-disable-line no-param-reassign
                widget.settings.label = this._expand(widget.settings.label, data); // eslint-disable-line no-param-reassign
                // The tags property is only used to match graphs, remove it before submission
                delete widget.tags;  // eslint-disable-line no-param-reassign


                return widget;
            }).filter((widget) => {
                return widget; // remove deleted widgets
            });

            console.log(`\tConfiguring gauge widgets`);
            for (let i = config.widgets.length - 1; i >= 0; i--) {
                const widget = config.widgets[i];

                if (widget.type !== 'gauge') {
                    continue;
                }

                const metric_name = this._expand(widget.settings.metric_name, data);
                const metricParts = metric_name.match(/^([^`]+)`(.*)$/);
                let foundMetric = false;

                if (metricParts === null) {
                    foundMetric = {}.hasOwnProperty.call(this.metrics, metric_name);
                } else {
                    const metricGroup = metricParts[1];
                    const metricName = metricParts[2];

                    if ({}.hasOwnProperty.call(this.metrics, metricGroup)) {
                        foundMetric = {}.hasOwnProperty.call(this.metrics[metricGroup], metricName);
                    }
                }

                if (foundMetric) {
                    widget.settings.metric_name = metric_name;
                    widget.settings.check_uuid = this.checkMeta.system.uuid;
                } else {
                    console.log(chalk.yellow('\tWARN'), 'No metric found for widget', widget.widget_id, 'matching', metric_name);
                }
            }


            console.log(`\tConfiguring forecast widgets`);
            for (let i = config.widgets.length - 1; i >= 0; i--) {
                const widget = config.widgets[i];

                if (widget.type !== 'forecast') {
                    continue;
                }

                if (!{}.hasOwnProperty.call(widget.settings, 'metrics')) {
                    console.log(`\t\tNo metrics attribute in widget '${widget.settings.title}', skipping.`);
                    continue;
                }

                if (!Array.isArray(widget.settings.metrics) || widget.settings.metrics.length === 0) {
                    console.log(`\t\t0 metrics defined for widget '${widget.settings.title}', skipping.`);
                    continue;
                }

                const forecast_metrics = [];

                for (const metric of widget.settings.metrics) {
                    const metric_name = this._expand(metric, data);
                    const metricParts = metric_name.match(/^([^`]+)`(.*)$/);
                    let foundMetric = false;

                    if (metricParts === null) {
                        foundMetric = {}.hasOwnProperty.call(this.metrics, metric_name);
                    } else {
                        const metricGroup = metricParts[1];
                        const metricName = metricParts[2];

                        if ({}.hasOwnProperty.call(this.metrics, metricGroup)) {
                            foundMetric = {}.hasOwnProperty.call(this.metrics[metricGroup], metricName);
                        }
                    }

                    if (foundMetric) {
                        forecast_metrics.push({
                            check_uuid: this.checkMeta.system.uuid,
                            metric_name
                        });
                    }
                }

                if (widget.settings.metrics.length !== forecast_metrics.length) {
                    console.log(`\t\tMetric count error, only found ${forecast_metrics.length} of ${widget.settings.metrics.length}`);
                    continue;
                }

                const forecastData = JSON.parse(JSON.stringify(data));

                widget.settings.title = this._expand(widget.settings.title, data);
                forecastData.forecast_metrics = forecast_metrics;
                widget.settings.resource_limit = this._expand(widget.settings.resource_limit, forecastData);
                widget.settings.resource_usage = this._expand(widget.settings.resource_usage, forecastData);
                delete widget.settings.metrics;
                console.log(`\t\tConfigured forecast widget '${widget.settings.title}'`);
            }


            console.log(`\tPurging unconfigured widgets`);
            for (let i = config.widgets.length - 1; i >= 0; i--) {
                let removeWidget = false;

                if (config.widgets[i].type === 'graph') {
                    removeWidget = config.widgets[i].settings.graph_id === null;
                } else if (config.widgets[i].type === 'gauge') {
                    removeWidget = config.widgets[i].settings.check_uuid === null;
                } else if (config.widgets[i].type === 'forecast') {
                    removeWidget = {}.hasOwnProperty.call(config.widgets[i].settings, 'metrics');
                } else if (config.widgets[i].type === 'html') {
                    removeWidget = !config.widgets[i].settings.markup || config.widgets[i].settings.markup === '';
                } else {
                    console.log(chalk.yellow('\tWARN'), `Unsupported widget type (${config.widgets[i].type}), ignoring widget id:${config.widgets[i].widget_id}`);
                }

                if (removeWidget) {
                    console.log(chalk.yellow('\tWARN'), `Removing widget from dashboard (id ${config.widgets[i].widget_id})`);
                    config.widgets.splice(i, 1);
                    missing_widgets += 1;
                }
            }

            if (config.widgets.length === 0) {
                console.log(chalk.red('ERROR'), 'No applicable widgets were configured with available metrics/graphs...');
                reject(new Error('No widgets configured on dashboard'));

                return;
            }

            if (missing_widgets > 0 && (/template-dashboard-system/).test(template.file)) {
                console.log(chalk.yellow('\tWARN'), 'Not all system dashboard widgets found, skipping creation.');
                resolve();

                return;
            }

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
     * managing creating all dashboards
     * @returns {Object} promise
     */
    createDashboards() {
        return new Promise((resolve, reject) => {
            const dashboardConfigs = [];

            try {
                const files = fs.readdirSync(cosi.reg_dir);

                for (let i = 0; i < files.length; i++) {
                    const file = files[i];

                    if (file.match(/^config-dashboard-/)) {
                        dashboardConfigs.push(path.resolve(path.join(cosi.reg_dir, file)));
                    }
                }
            } catch (err) {
                reject(err);

                return;
            }

            this.on('create.dashboard.next', () => {
                const configFile = dashboardConfigs.shift();

                if (typeof configFile === 'undefined') {
                    this.removeAllListeners('config.dashboard.next');
                    resolve();

                    return;
                }

                this.createDashboard(configFile).
                    then(() => {
                        this.emit('create.dashboard.next');
                    }).
                    catch((err) => {
                        reject(err);
                    });
            });

            this.emit('create.dashboard.next');
        });
    }

    /**
     * create specific dashboard
     * @arg {String} cfgFile for dashboard
     * @returns {Object} promise
     */
    createDashboard(cfgFile) {
        return new Promise((resolve, reject) => {
            console.log(chalk.blue(this.marker));
            console.log('Creating dashboard', cfgFile);

            const regFile = cfgFile.replace('config-', 'registration-');

            if (this._fileExists(regFile)) {
                console.log(chalk.bold('\tRegistration exists'), `- using ${regFile}`);
                resolve();

                return;
            }

            if (!this._fileExists(cfgFile)) {
                reject(new Error(`Missing dashboard configuration file '${cfgFile}'`));

                return;
            }

            const dashboard = new Dashboard(cfgFile);

            if (dashboard.verifyConfig()) {
                console.log('\tValid dashboard config');
            }

            console.log('\tSending dashboard configuration to Circonus API');

            this._findDashboard(dashboard.title).
                then((regConfig) => {
                    if (regConfig === null) {
                        console.log('\tSending dashboard configuration to Circonus API');

                        return dashboard.create();
                    }

                    console.log(`\tSaving registration ${regFile}`);
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

                    console.log(chalk.green('\tDashboard:'), `${this.regConfig.account.ui_url}/dashboards/view/${regConfig._dashboard_uuid}`);

                    return null;
                }).
                then((cfg) => {
                    if (cfg !== null) {
                        console.log(`\tSaving registration ${regFile}`);
                        dashboard.save(regFile, true);

                        console.log(chalk.green('\tDashboard created:'), `${this.regConfig.account.ui_url}/dashboards/view/${cfg._dashboard_uuid}`);
                    }
                    resolve();
                }).
                catch((err) => {
                    reject(err);
                });
        });
    }


    /**
     * noop placeholder
     * @returns {Object} promise
     */
    finalizeDashboards() { // eslint-disable-line class-methods-use-this
        // NOP at this time
        return Promise.resolve();
    }


    /*

    Utility methods

    */

    /**
     * find a specific dashboard
     * @arg {String} title to search for
     * @arg {Function} cb callback
     * @returns {Object} promise
     */
    _findDashboard(title) { // eslint-disable-line class-methods-use-this
        return new Promise((resolve, reject) => {
            if (title === null) {
                reject(new Error('Invalid dashboard title'));

                return;
            }

            console.log(`\tChecking API for existing dashboard with title '${title}'`);

            api.get('/dashboard', { f_title: title }).
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
                        if (res.parsed_body.length > 1) {
                            console.log(chalk.red('\tERROR'), `Found ${res.parsed_body.length} existing dashboards matching title '${title}', there should be only one.`);
                            process.exit(1);
                        }

                        console.log(chalk.green('\tFound'), `Existing dashboard with title '${title}'`);
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


    /**
     * find graph for a widget
     * @arg {Object} widget with graph
     * @arg {Object} metaData about system
     * @returns {Number} the graph index
     */
    _findWidgetGraph(widget, metaData) {
        for (let graphIdx = 0; graphIdx < this.graphs.length; graphIdx++) {
            const graph = this.graphs[graphIdx];

            for (let j = 0; j < widget.tags.length; j++) {
                const tag = widget.tags[j];

                if (graph.tags.indexOf(tag) !== -1) { // graph contains tag?
                    return graphIdx;
                }
                for (let sgIdx = 0; sgIdx < metaData.sys_graphs.length; sgIdx++) {
                    const sys_graph = metaData.sys_graphs[sgIdx];

                    if (sys_graph.dashboard_tag !== tag) {
                        continue;
                    }
                    if (graph.instance_name === sys_graph.instance_name) {
                        return graphIdx;
                    }
                }
            }
        }

        return -1;
    }

}

module.exports = Dashboards;

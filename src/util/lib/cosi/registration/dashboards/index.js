'use strict';

/* eslint-env node, es6 */

/* eslint-disable global-require */

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

class Dashboards extends Registration {

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

    create(cb) {
        console.log(chalk.bold('\nRegistration - dashboards'));

        const self = this;

        this.once('checks.load', () => {
            console.log(chalk.blue(this.marker));
            console.log('Loading check meta data');

            const checks = new Checks();

            self.checkMeta = checks.getMeta();
            if (self.checkMeta === null) {
                self.emit('error', new Error('Unable to load check meta data'));
                return;
            }
            console.log(chalk.green('Loaded'), 'check meta data');
            self.emit('templates.find');
        });

        this.once('templates.find', this.findTemplates);
        this.once('templates.find.done', () => {
            if (self.templates.length === 0) {
                console.log(chalk.yellow('WARN'), 'No dashboard templates found');
                console.log(chalk.green('\nSKIPPING'), 'dasbhoards, none found to register');
                self.emit('dashboards.done');
                return;
            }
            self.emit('metrics.load');
        });

        this.once('metrics.load', this.loadMetrics);
        this.once('metrics.load.done', () => {
            self.emit('graphs.load');
        });

        this.once('graphs.load', this.loadGraphs);
        this.once('graphs.load.done', () => {
            self.emit('dashboards.config');
        });

        this.once('dashboards.config', this.configDashboards);
        this.once('dashboards.config.done', () => {
            self.emit('dashboards.create');
        });

        this.once('dashboards.create', this.createDashboards);
        this.once('dashboards.create.done', () => {
            self.emit('dashboards.finalize');
        });

        this.once('dashboards.finalize', () => {
            // noop at this point
            self.emit('dashboards.done');
        });

        this.once('dashboards.done', () => {
            if (typeof cb === 'function') {
                cb();
                return;
            }
        });

        this.emit('checks.load');
    }

    findTemplates() {
        console.log(chalk.blue(this.marker));
        console.log('Identifying dashboard templates');

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

                if (templateType !== 'dashboard') {
                    continue;
                }

                console.log(`\tFound ${templateType}-${templateId} ${template.file}`);
                self.templates.push(template);
            }

            console.log(chalk.green('Loaded'), `${this.templates.length} template(s)`);
            self.emit('templates.find.done');
        });
    }


    loadGraphs() {
        console.log(chalk.blue(this.marker));
        console.log('Loading graphs');

        this.graphs = [];

        const fileList = fs.readdirSync(cosi.reg_dir);

        for (let i = 0; i < fileList.length; i++) {
            const file = fileList[i];

            if (file.match(/^registration-graph-/)) {
                console.log(`\tExtracting meta data from ${file}`);
                const graphCfgFile = path.resolve(path.join(cosi.reg_dir, file));
                const graph = new Graph(graphCfgFile);

                this.graphs.push({
                    instance_name: path.basename(file, '.json').replace(/^registration-graph-/, ''),
                    tags: graph.tags.join(','),
                    id: graph._cid.replace('/graph/', '')
                });
            }
        }

        if (this.graphs === null || this.graphs.length === 0) {
            this.emit('error', new Error('Unable to load meta data for graphs'));
            return;
        }

        console.log(chalk.green('Loaded'), `meta data from ${this.graphs.length} graphs`);
        this.emit('graphs.load.done');
    }


    configDashboards() {
        const self = this;
        const dashboards = this.templates;

        console.log(chalk.bold(`Configuring dasbhoards`), `for ${this.templates.length} template(s)`);

        this.on('config.dashboard.next', () => {
            const template = dashboards.shift();

            if (typeof template === 'undefined') {
                self.emit('dashboards.config.done');
                return;
            }

            self.configDashboard(template);
            self.emit('config.dashboard.next');
        });

        this.emit('config.dashboard.next');
    }


    configDashboard(template) {
        console.log(chalk.blue(this.marker));
        console.log(`Configuring dasbhoard`);

        const templateMatch = template.file.match(/^template-dashboard-([^\-]+)-(.+)\.json$/);

        if (templateMatch === null) {
            this.emit('error', new Error(`Invalid template, no instance found. ${template.file}`));
            return;
        }

        const dashboardID = `${templateMatch[1]}-${templateMatch[2]}`;
        const dashboardInstance = templateMatch[2];
        const templateFile = path.resolve(path.join(cosi.reg_dir, template.file)); // path.resolve(path.join(cosi.reg_dir, `template-dashboard-${dashboardID}.json`));
        const configFile = templateFile.replace('template-', 'config-'); // path.resolve(path.join(cosi.reg_dir, `config-dashboard-${dashboardID}-${dashboardItem}.json`));

        console.log(`\tDashboard: ${dashboardID} (${templateFile})`);

        if (this._fileExists(configFile)) {
            console.log('\tDashboard configuration already exists', configFile);
            this.emit('config.dashboard.next');
            return;
        }

        const metaFile = path.resolve(path.join(cosi.reg_dir, `meta-dashboard-${dashboardID}.json`));
        let metaData = { sys_graphs: [] };

        console.log(`\tUsing meta data from ${metaFile}`);

        if (this._fileExists(metaFile)) {
            try {
                metaData = require(metaFile);
                if (!{}.hasOwnProperty.call(metaData, 'sys_graphs')) {
                    metaData.sys_graphs = [];
                }
            } catch (err) {
                if (err.code !== 'MODULE_NOT_FOUND') {
                    this.emit('error', err);
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

        // const template = new Template(templateFile);
        const config = JSON.parse(JSON.stringify(template.config.config));
        let data = null;

        data = this._mergeData(`dashboard-${dashboardID}`);
        data.dashboard_instance = dashboardInstance;

        console.log(`\tInterpolating title ${config.title}`);
        config.title = this._expand(config.title, data);

        console.log(`\tConfiguring graph widgets`);
        for (let i = config.widgets.length - 1; i >= 0; i--) {
            const widget = config.widgets[i];

            if (widget.type !== 'graph') {
                continue;
            }

            const graphIdx = this._findWidgetGraph(widget, metaData);

            if (graphIdx === -1) {
                console.log(chalk.yellow('\tWARN'), 'No graph found for', widget.widget_id, 'with tag', widget.tags);
                continue;
            }
            widget.settings._graph_title = this._expand(widget.settings._graph_title, data);
            widget.settings.account_id = this.regConfig.account.account_id;
            widget.settings.graph_id = this.graphs[graphIdx].id;
            widget.settings.label = this._expand(widget.settings.label, data);
            delete widget.tags; // tags property used to match graphs, remove before submission
        }

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
                widget.settings.account_id = this.regConfig.account.account_id;
                widget.settings.check_uuid = this.checkMeta.system.uuid;
                // why wouldn't '_type' already be named 'type' in the template?
                widget.settings.type = widget.settings._type;
            } else {
                console.log(chalk.yellow('\tWARN'), 'No metric found for widget', widget.widget_id, 'matching', metric_name);
            }
        }

        console.log(`\tPurging widgets`);
        for (let i = config.widgets.length - 1; i >= 0; i--) {
            let removeWidget = false;

            if (config.widgets[i].type === 'graph') {
                removeWidget = config.widgets[i].settings.graph_id === null;
            } else if (config.widgets[i].type === 'gauge') {
                removeWidget = config.widgets[i].settings.check_uuid === null;
            } else {
                console.log(chalk.yellow('\tWARN'), `Unsupported widget type (${config.widgets[i].type}), ignoring widget id:${config.widgets[i].widget_id}`);
            }

            if (removeWidget) {
                console.log(chalk.yellow('\tWARN'), `Removing widget from dashboard (id ${config.widgets[i].widget_id})`);
                config.widgets.splice(i, 1);
            }
        }

        if (config.widgets.length === 0) {
            console.log(chalk.red('ERROR'), 'No applicable widgets were configured with available metrics/graphs...');
            this.emit('error', new Error('No widgets configured on dashboard'));
            return;
        }

        try {
            fs.writeFileSync(configFile, JSON.stringify(config, null, 4), { encoding: 'utf8', mode: 0o644, flag: 'w' });
        } catch (err) {
            this.emit('error', err);
            return;
        }

        console.log('\tSaved configuration', configFile);
    }


    createDashboards() {
        const self = this;
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
            this.emit('error', err);

            return;
        }

        this.on('create.dashboard.next', () => {
            const configFile = dashboardConfigs.shift();

            if (typeof configFile === 'undefined') {
                self.emit('dashboards.create.done');
                return;
            }

            self.createDashboard(configFile);
        });

        this.emit('create.dashboard.next');
    }

    createDashboard(cfgFile) {
        console.log(chalk.blue(this.marker));
        console.log('Creating dashboard', cfgFile);

        const regFile = cfgFile.replace('config-', 'registration-');

        if (this._fileExists(regFile)) {
            console.log(chalk.bold('\tRegistration exists'), `using ${regFile}`);
            this.emit('create.dashboard.next');
            return;
        }

        console.log('\tSending dashboard configuration to Circonus API');

        const self = this;
        const dash = new Dashboard(cfgFile);

        dash.create((err) => {
            if (err) {
                self.emit('error', err);
                return;
            }

            console.log(`\tSaving registration ${regFile}`);
            dash.save(regFile, true);

            console.log(chalk.green('\tDashboard created:'), `${self.regConfig.account.ui_url}/dashboards/view/${dash._dashboard_uuid}`);
            self.emit('create.dashboard.next');
        });
    }


    finalizeDashboards() {
        // noop at this point
        this.emit('dashboards.finalize.done');
    }


    /*

    Utility methods

    */


    _findWidgetGraph(widget, metaData) {
        for (let graphIdx = 0; graphIdx < this.graphs.length; graphIdx++) {
            for (let j = 0; j < widget.tags.length; j++) {
                if (this.graphs[graphIdx].tags.indexOf(widget.tags[j]) !== -1) {
                    return graphIdx;
                }
                for (let sgIdx = 0; sgIdx < metaData.sys_graphs.length; sgIdx++) {
                    if (metaData.sys_graphs[sgIdx].dashboard_tag === widget.tags[j]) {
                        if (this.graphs[graphIdx].instance_name === metaData.sys_graphs[sgIdx].instance_name) {
                            return graphIdx;
                        }
                    }
                }
            }
        }
        return -1;
    }

}

module.exports = Dashboards;

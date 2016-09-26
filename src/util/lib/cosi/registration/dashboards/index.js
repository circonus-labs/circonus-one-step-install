'use strict';

/* eslint-env node, es6 */

/* eslint-disable global-require */

const fs = require('fs');
const path = require('path');

const chalk = require('chalk');

const cosi = require(path.resolve(path.resolve(__dirname, '..', '..', '..', 'cosi')));
const Registration = require(path.resolve(cosi.lib_dir, 'registration'));
const Checks = require(path.resolve(cosi.lib_dir, 'registration', 'checks'));
const Template = require(path.join(cosi.lib_dir, 'template'));
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
            if (self.templates.length < 1) {
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
                self.templates.push(templateId);
            }

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
                    instance_name: path.basename(file, '.json').replace(/^registration-graph-/, '').split('-'),
                    tags: graph.tags.join(','),
                    id: graph._cid.replace('/graph/', '')
                });
            }
        }

        if (this.graphs === null || this.graphs.length === 0) {
            this.emit('error', new Error('Unable to load meta data for graphs'));
            return;
        }

        this.emit('graphs.load.done');

    }


    configDashboards() {
        const self = this;
        const dashboards = this.templates;

        this.on('config.dashboard', this.configDashboard);

        this.on('config.dashboard.next', () => {
            const dashboardID = dashboards.shift();

            if (typeof dashboardID === 'undefined') {
                self.removeAllListeners('config.dashboard');
                self.removeAllListeners('config.dashboard.next');
                self.emit('dashboards.config.done');
            } else {
                const metaFile = path.resolve(path.join(cosi.reg_dir, `meta-dashboard-${dashboardID}.json`));
                let metaData = { items: [ 'default' ] };

                console.log(`\tUsing meta data from ${metaFile}`);

                if (this._fileExists(metaFile)) {
                    try {
                        metaData = require(metaFile);
                        if (!{}.hasOwnProperty.call(metaData, 'items')) {
                            console.log(chalk.yellow('WARN'), `metadata file found but does not contain an 'items' attribute ${metaFile}`);
                            metaData = { items: [ 'default' ] };
                        }
                    } catch (err) {
                        if (err.code !== 'MODULE_NOT_FOUND') {
                            this.emit('error', err);
                            return;
                        }
                    }
                }

                for (let i = 0; i < metaData.items.length; i++) {
                    this.configDashboard(dashboardID, metaData, i);
                }
                this.emit('config.dashboard.next');
            }
        });

        this.emit('config.dashboard.next');
    }


    configDashboard(dashboardID, metaData, metaIdx) {
        const dashboardItem = metaData[metaIdx];

        console.log(chalk.blue(this.marker));
        console.log(`Configuring ${dashboardID}-${dashboardItem} dasbhoard`);

        const templateFile = path.resolve(path.join(cosi.reg_dir, `template-dashboard-${dashboardID}.json`));
        const configFile = path.resolve(path.join(cosi.reg_dir, `config-dashboard-${dashboardID}-${dashboardItem}.json`));

        console.log(`\tUsing template ${templateFile}`);

        if (this._fileExists(configFile)) {
            console.log('\tDashboard configuration already exists', configFile);
            this.emit('config.dashboard.next');
            return;
        }

        const template = new Template(templateFile);
        const config = template.config;
        let data = null;

        if (dashboardItem === 'default') {
            data = this._mergeData(`dashboard-${dashboardID}`);
        } else {
            data = this._mergeData(`dashboard-${dashboardID}-${dashboardItem}`);
            data.dashboard_item = dashboardItem;
        }

        console.log(`\tInterpolating title ${config.title}`);
        config.title = this._expand(config.title, data);

        // find the matching graph based on tags
        for (let i = config.widgets.length - 1; i >= 0; i--) {
            const widget = config.widgets[i];

            if (widget.type !== 'graph') {
                continue;
            }

            const graphIdx = this._findWidgetGraph(widget, metaData);

            if (graphIdx !== -1) {
                widget.settings._graph_title = this._expand(widget.settings._graph_title, data);
                widget.settings.account_id = this.regConfig.account.account_id;
                widget.settings.graph_id = this.graphs[graphIdx].id;
                widget.settings.label = this._expand(widget.settings.label, data);
                delete widget.tags; // tags property used to match graphs, remove before submission
            }
        }

        // find metrics for gauge widgets
        for (let i = config.widgets.length - 1; i >= 0; i--) {
            const widget = config.widgets[i];

            if (widget.type === 'gauge') {
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
                }
            }
        }

        // purge widgets that couldn't be configured
        for (let i = config.widgets.length - 1; i >= 0; i--) {
            let removeWidget = false;

            if (config.widgets[i].type === 'gauge') {
                removeWidget = config.widgets[i].settings.graph_id !== null;
            } else if (config.widgets[i].type === 'graph') {
                removeWidget = config.widgets[i].settings.check_uuid !== null;
            } else {
                console.log(chalk.yellow('WARN'), `Unsupported widget type (${config.widgets[i].type}), ignoring widget id:${config.widgets[i].widget_id}`);
            }

            if (removeWidget) {
                console.log(chalk.yellow('WARN'), `Removing widget from dashboard ${config.widgets[i]}`);
                config.widgets.splice(i, 1);
            }
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

        this.on('create.dashboard', this.createDashboard);

        this.on('create.dashboard.next', () => {
            const configFile = dashboardConfigs.shift();

            if (typeof configFile === 'undefined') {
                self.removeAllListeners('create.dashboard');
                self.removeAllListeners('create.dashboard.next');
                self.emit('dashboards.done');
            } else {
                self.emit('create.dashboard', configFile);
            }
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


    // x_configDashboards(name, dashboard_items) {
    //     const id = `dashboard-${name}`;
    //     const self = this;
    //
    //     console.log(chalk.blue(this.marker));
    //     console.log(`Configuring Dashboard (${id})`);
    //
    //     const templateFile = path.resolve(this.regDir, `template-${id}.json`);
    //
    //     if (!this._fileExists(templateFile)) {
    //         console.log('\tNo template for dashboard', templateFile);
    //         return;
    //     }
    //
    //     const template = new Template(templateFile);
    //     const config = template.config;
    //
    //     for (let di = 0; di < dashboard_items.length; di++) {
    //         const item = dashboard_items[di];
    //
    //         data.dashboard_item = item;
    //         this._writeDashboardConfig(template, config, `${id}-${item}`, data,
    //                                    registeredGraphs, registeredCheck);
    //     }
    // }
    //
    //
    // _writeDashboardConfig(template, config, id, data, registeredGraphs, registeredCheck) { // eslint-disable-line max-params
    //     const configFile = path.resolve(this.regDir, `config-${id}.json`);
    //     const self = this;
    //     // const check_dirty = false;
    //     const checkMetrics = [];
    //
    //     if (this._fileExists(configFile)) {
    //         console.log('\tDashboard configuration already exists', configFile);
    //         this.emit('dashboard.config.done', configFile);
    //         return;
    //     }
    //
    //     config.title = self._expand(config.title, data); // eslint-disable-line no-param-reassign
    //
    //     // for (const widget of config.widgets)
    //     for (let i = config.widgets.length - 1; i >= 0; i--) {
    //         const widget = config.widgets[i];
    //
    //         if (widget.name === 'Graph') {
    //             /* find the matching graph based on tags in registeredGraphs */
    //             let found_graph = false;
    //
    //             for (let gi = 0; gi < registeredGraphs.length; gi++) {
    //                 const graph = registeredGraphs[gi];
    //
    //                 if (graph && graph.tags && graph.tags.length > 0) {
    //                     for (let j = 0; j < widget.tags.length; j++) {
    //                         if (graph.tags.indexOf(widget.tags[j]) !== -1) { // eslint-disable-line max-depth
    //                             /* need to fill the account_id and graph_id fields */
    //                             widget.settings._graph_title = self._expand(widget.settings._graph_title, data);
    //                             widget.settings.account_id = this.regConfig.account.account_id;
    //                             widget.settings.graph_id = graph._cid.replace('/graph/', '');
    //                             widget.settings.label = self._expand(widget.settings.label, data);
    //                             /* tags property is just used to match widgets to graphs, remove before submission */
    //                             delete widget.tags;
    //                             widget.type = 'graph';
    //                             found_graph = true;
    //                             break;
    //                         }
    //                     }
    //                     if (found_graph) {
    //                         break;
    //                     }
    //                 }
    //             }
    //             if (found_graph === false) {
    //                 console.log(chalk.yellow('WARN'), 'Could not find matching graph for:', JSON.stringify(widget.tags));
    //                 /* pull this graph out of the dashboard */
    //                 config.widgets.splice(i, 1);
    //             }
    //         } else if (widget.name === 'Gauge') {
    //             /* find the matching metric on this system */
    //             const metric_name = self._expand(widget.settings.metric_name, data);
    //             let metric = null;
    //
    //             widget.settings.metric_name = metric_name;
    //
    //             if (metric_name.search('`') === -1) {
    //                 if ({}.hasOwnProperty.call(this.metrics, metric_name)) {
    //                     metric = this.metrics[metric_name];
    //                 } else {
    //                     console.log(chalk.yellow('WARN'), `No active metric found for ${metric_name}`);
    //                     config.widgets.splice(i, 1);
    //                 }
    //             } else {
    //                 const mg = metric_name.split('`')[0];
    //
    //                 if ({}.hasOwnProperty.call(this.metrics, mg)) {
    //                     const metric_group = this.metrics[mg];
    //                     const mn = metric_name.replace(`${mg}\``, '');
    //
    //                     if ({}.hasOwnProperty.call(metric_group, mn)) {
    //                         metric = metric_group[mn];
    //                     } else {
    //                         console.log(chalk.yellow('WARN'), `No active metric ${mn} found in metric group ${mg}`);
    //                     }
    //                 } else {
    //                     console.log(chalk.yellow('WARN'), `No active metric group found ${mg}`);
    //                 }
    //             }
    //
    //             if (metric === null) {
    //                 console.log(chalk.yellow('WARN'), 'No metrics found for', widget.name);
    //                 config.widgets.splice(i, 1);
    //             } else {
    //                 /* need to ensure the needed metric is active in the check */
    //                 checkMetrics.push({
    //                     name: metric_name,
    //                     type: metric._type === 's' ? 'text' : 'numeric',
    //                     status: 'active'
    //                 });
    //                 widget.settings.account_id = this.regConfig.account.account_id;
    //                 widget.settings.check_uuid = registeredCheck._check_uuids[0];
    //                 widget.settings.type = widget.settings._type;
    //                 widget.type = 'gauge';
    //             }
    //         }
    //     }
    //
    //     try {
    //         fs.writeFileSync(
    //             configFile,
    //             JSON.stringify(config, null, 4),
    //             { encoding: 'utf8', mode: 0o644, flag: 'w' });
    //     } catch (err) {
    //         this.emit('error', err);
    //         return;
    //     }
    //     console.log('\tSaved configuration', configFile);
    //
    //     this.resaveCheck(registeredCheck, checkMetrics);
    //
    //     this.emit('dashboard.config.done', configFile);
    // }

    // resaveCheck(registeredCheck, extraMetrics) {
    //     const self = this;
    //
    //     const checkMetrics = this._extractMetricsFromGraphConfigs();
    //
    //     if (extraMetrics) {
    //         extraMetrics.forEach((item) => {
    //             checkMetrics.push(item);
    //         });
    //     }
    //     registeredCheck.metrics = checkMetrics; // eslint-disable-line no-param-reassign
    //
    //     /* re-save the check config since it changed */
    //     const checkConfigFile = path.resolve(this.regDir, 'config-check-system.json');
    //
    //     fs.writeFileSync(
    //         checkConfigFile,
    //         JSON.stringify(registeredCheck, null, 4),
    //         { encoding: 'utf8', mode: 0o644, flag: 'w' }
    //     );
    //
    //     const regFile = path.resolve(this.regDir, 'registration-check-system.json');
    //
    //     const check = new Check(checkConfigFile);
    //
    //     console.log('\tSending altered check configuration to Circonus API');
    //     check.update((err) => {
    //         if (err) {
    //             self.emit('error', `Cannot re-save check config "${err}"`);
    //             return;
    //         }
    //         console.log(`\tSaving registration ${regFile}`);
    //         check.save(regFile, true);
    //     });
    // }


    /*

    Utility methods

    */

    _findWidgetGraph(widget, metaData) {
        for (let graphIdx = 0; graphIdx < this.graphs.length; graphIdx++) {
            for (let j = 0; j < widget.tags.length; j++) {
                if (this.graphs[graphIdx].tags.indexOf(widget.tags[j])) {
                    return graphIdx;
                }
                for (let sgIdx = 0; sgIdx < metaData.sys_graphs.length; sgIdx++) {
                    if (metaData.sys_graphs[sgIdx].dashboard_tag === widget.tags[j]) {
                        if (this.graphs[graphIdx].instance_id === metaData.sys_graphs[sgIdx].instance_id) {
                            return graphIdx;
                        }
                    }
                }
            }
        }
        return -1;
    }


    // _setCustomDashboardOptions(cfg, id) {
    //     assert.equal(typeof cfg, 'object', 'cfg is required');
    //     assert.equal(typeof id, 'string', 'id is required');
    //
    //     console.log('\tApplying custom config options and interpolating templates');
    //
    //     const idParts = id.split('-', 2);
    //     const options = [
    //         'title'
    //     ];
    //
    //     if (idParts.length === 2) {
    //         const cfgType = idParts[0];
    //         const cfgId = idParts[1];
    //
    //         if ({}.hasOwnProperty.call(cosi.custom_options, cfgType)) {
    //             const custom = cosi.custom_options[cfgType];
    //
    //             for (let i = 0; i < options.length; i++) {
    //                 const opt = options[i];
    //
    //                 if ({}.hasOwnProperty.call(custom, opt)) {
    //                     console.log(`\tSetting ${opt} to ${custom[opt]}`);
    //                     cfg[opt] = custom[opt]; // eslint-disable-line no-param-reassign
    //                 }
    //             }
    //
    //             if ({}.hasOwnProperty.call(custom, cfgId)) {
    //                 for (let i = 0; i < options.length; i++) {
    //                     const opt = options[i];
    //
    //                     if ({}.hasOwnProperty.call(custom[cfgId], opt)) {
    //                         console.log(`\tSetting ${opt} to ${custom[cfgId][opt]}`);
    //                         cfg[opt] = custom[cfgId][opt]; // eslint-disable-line no-param-reassign
    //                     }
    //                 }
    //             }
    //         }
    //     }
    //
    //     const data = this._mergeData(id);
    //
    //     for (let i = 0; i < options.length; i++) {
    //         const opt = options[i];
    //
    //         console.log(`\tInterpolating ${opt} ${cfg[opt]}`);
    //         cfg[opt] = this._expand(cfg[opt], data); // eslint-disable-line no-param-reassign
    //     }
    //
    //     // interpolate widget fields
    //
    //     // Gauges
    //     // check_uuid, account_id, metric_display_name, title
    //
    //     // Graphs
    //     // graph_id (actually graph uuid),
    //
    // }


}

module.exports = Dashboards;

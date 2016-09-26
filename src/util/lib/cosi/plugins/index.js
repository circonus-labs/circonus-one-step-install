'use strict';

/* eslint-env node, es6 */
/* eslint-disable no-magic-numbers, global-require, camelcase */

const assert = require('assert');
const Events = require('events').EventEmitter;
const fs = require('fs');
const path = require('path');
const child = require('child_process');

const chalk = require('chalk');

const cosi = require(path.resolve(path.join(__dirname, '..')));
const TemplateFetcher = require(path.resolve(path.join(cosi.lib_dir, 'template', 'fetch')));
const Check = require(path.resolve(cosi.lib_dir, 'check'));
const Graph = require(path.resolve(cosi.lib_dir, 'graph'));
const Dashboard = require(path.resolve(cosi.lib_dir, 'dashboard'));

class Plugin extends Events {

    constructor(params) {
        super();

        this.params = params;
        this.quiet = params.quiet;
        this.name = null; // set/override in subclass
        this.dashboardPrefix = null; // set/override in subclass
        this.graphPrefix = null; // set/override in subclass
        this.state = null; // set/override in subclass

        this.marker = '==========';
        this.on('error', (err) => {
            console.log(chalk.red('***************'));
            console.dir(err);
            console.log(chalk.red('***************'));
            process.exit(1); // eslint-disable-line no-process-exit
        });
    }

    enablePlugin() {
        throw new Error('not overridden by plugin subclass');
    }
    configurePlugin() {
        throw new Error('not overridden by plugin subclass');
    }

    enable() {
        const self = this;

        this.once('enable.done', this.configure);
        this.once('configure.done', this.register);

        this.enablePlugin((err) => {
            if (err !== null) {
                self.emit('error', err);
                return;
            }
            self.emit('enable.done');
        });
    }


    configure() {
        const self = this;

        this.configurePlugin((err) => {
            if (err !== null) {
                self.emit('error', err);
                return;
            }
            self.emit('configure.done');
        });
    }


    register() {
        console.log(chalk.blue(this.marker));
        console.log('Updating registration');

        const self = this;
        const script = path.resolve(path.join(cosi.cosi_dir, 'bin', 'cosi'));
        const reg = child.spawn(script, [ 'register' ]);

        reg.stdout.on('data', (data) => {
            console.log(data);
        });
        reg.stderr.on('data', (data) => {
            console.log(chalk.red('stderr:'), data);
        });
        reg.on('error', (spawnErr) => {
            console.error(spawnErr);
            process.exit(1); // eslint-disable-line no-process-exit
        });
        reg.on('close', (code) => {
            console.log('reg finished with code', code);
            if (code !== 0) {
                process.exit(code); // eslint-disable-line no-process-exit
            }
            self.emit('register.done');
        });
    }

    // override in subclass if there are multiple templates to fetch
    fetchTemplates() {
        const self = this;
        const templateId = `dashboard-${this.name}`;
        const cfgFile = path.resolve(path.join(cosi.reg_dir, `template-${templateId}.json`));
        const fetcher = new TemplateFetcher();

        console.log(`\tFetching templates for ${templateId}`);

        fetcher.template(templateId, (err, template) => {
            if (err !== null) {
                self.emit('error', err);
                return;
            }

            template.save(cfgFile, true);
            console.log(chalk.green('\tSaved'), `template ${cfgFile}`);
            self.emit('fetch.done');
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


    _execShell(cmd, doneEvent) {
        const self = this;

        child.exec(cmd, (error, stdout, stderr) => {
            if (error) {
                self.emit('error', new Error(`${error} ${stderr}`));
                return;
            }
            self.emit(doneEvent, stdout);
        });
    }


    disablePlugin(pluginName, dashboardPrefix, graphPrefix) {
        const self = this;

        this.once('deconfig.plugin', () => {

            /* find all related graphs and dashboards for this plugin */
            let files = null;
            const removeMetrics = [];
            const removeFiles = [];
            let deconfiguredCount = 0;
            let expectCount = 0;

            try {
                files = fs.readdirSync(cosi.reg_dir);
            } catch (err) {
                self.emit(err);
                return;
            }

            for (let i = 0; i < files.length; i++) {
                const file = path.resolve(cosi.reg_dir, files[i]);

                if (files[i].indexOf(`registration-dashboard-${dashboardPrefix}`) !== -1) {
                    const dash = require(file);

                    for (let j = 0; j < dash.widgets.length; j++) {
                        const widget = dash.widgets[j];

                        if (widget.name === 'Gauge') {
                            removeMetrics.push(widget.settings.metric_name);
                        }
                    }
                    removeFiles.push({ type : 'dash', file });
                }

                if (files[i].indexOf(`registration-graph-${graphPrefix}`) !== -1) {
                    const graph = require(file);

                    for (let j = 0; j < graph.datapoints.length; j++) {
                        const dp = graph.datapoints[j];

                        removeMetrics.push(dp.metric_name);
                    }
                    removeFiles.push({ type : 'graph', file });
                }
            }

            expectCount = removeFiles.length;
            self.on('item.deconfigured', () => {
                deconfiguredCount += 1;
                if (deconfiguredCount === expectCount) {
                    self.emit('plugin.done');
                }
            });

            const check = new Check(path.resolve(cosi.reg_dir, 'registration-check-system.json'));
            const checkMetrics = check.metrics;

            for (let i = 0; i < checkMetrics.length; i++) {
                for (let j = 0; j < removeMetrics.length; j++) {
                    if (checkMetrics[i].name === removeMetrics[j]) {
                        checkMetrics.splice(i, 1);
                        i -= 1;
                    }
                }
            }
            check.metrics = checkMetrics;
            check.update((err) => {
                if (err) {
                    self.emit(err);
                    return;
                }
                console.log('Updated system check with removed metrics');

                /* now remove all the graphs and dashboards we found above */
                for (let i = 0; i < removeFiles.length; i++) {
                    console.log(`Removing: ${removeFiles[i].file}`);
                    if (removeFiles[i].type === 'dash') {
                        const dash = new Dashboard(removeFiles[i].file);

                        dash.remove((dashboardRemoveErr) => {
                            if (dashboardRemoveErr) {
                                self.emit('error', dashboardRemoveErr);
                                return;
                            }

                            const cfgFile = removeFiles[i].file.replace('registration-', 'config-');

                            console.log(`Removing file: ${removeFiles[i].file}`);
                            fs.unlinkSync(removeFiles[i].file);
                            console.log(`Removing file: ${cfgFile}`);
                            fs.unlinkSync(cfgFile);
                            self.emit('item.deconfigured');
                        });
                    }

                    if (removeFiles[i].type === 'graph') {
                        const graph = new Graph(removeFiles[i].file);

                        graph.remove((graphRemoveErr) => {
                            if (graphRemoveErr) {
                                self.emit('error', graphRemoveErr);
                                return;
                            }
                            const cfgFile = removeFiles[i].file.replace('registration-', 'config-');

                            console.log(`Removing file: ${removeFiles[i].file}`);
                            fs.unlinkSync(removeFiles[i].file);
                            console.log(`Removing file: ${cfgFile}`);
                            fs.unlinkSync(cfgFile);
                            self.emit('item.deconfigured');
                        });
                    }
                }
            });
        });

        this.once('nad.disabled', (stdout) => {
            self.emit('deconfig.plugin', stdout);
        });

        const script = path.resolve(path.join(__dirname, pluginName, 'nad-disable.sh'));

        self._execShell(script, 'nad.disabled');

    }
}

module.exports = Plugin;

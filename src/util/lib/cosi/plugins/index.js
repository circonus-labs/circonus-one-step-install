'use strict';

/* eslint-env node, es6 */

/* eslint-disable global-require */

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


/* Plugin base class

Intended to be extended by a plugin. The plugin must fill in four pieces of data:
    name            the name of the plugin (e.g. postgres) templates need to conform to a naming standard
                    template-templatetype-pluginname-plugininstance.json - template-dashboard-postgres-mydebname.json
    dashboardPrefix if other than pluginname
    graphPrefix     if other than pluginname (e.g. 'pg_' for postgres, the metric group in NAD)
    state           minimum required attribute is 'enabled' true|false. can be used to pass inforamtion from
                    pluginEnable to pluginConfigure

The plugin must override three functions. Each function will be passed a callback function expecting
one parameter 'err' which is an Error() or null if no error occurred.

    enablePlugin    enables the plugin (links scripts in nad plugin directory, starts daemons, creates
                    any configuration files for the plugin, etc.)
    configurePlugin responsible for adding templates to cosi.reg_dir
    disablePlugin   'undo' whatever enablePlugin did

*/

class Plugin extends Events {

    constructor(params) {
        super();

        this.params = params;
        this.quiet = params.quiet;
        this.name = null;               // set/override in subclass
        this.dashboardPrefix = null;    // set/override in subclass (if different from name)
        this.graphPrefix = null;        // set/override in subclass (if different from name)
        this.state = {                  // override in subclass with result of enablePlugin
            enabled: false
        };

        this.marker = '==========';
        this.on('error', (err) => {
            console.log(chalk.red('***************'));
            console.dir(err);
            console.log(chalk.red('***************'));
            process.exit(1); // eslint-disable-line no-process-exit
        });
    }

    // make plugin "work" e.g. symlinks for nad, daemon, configuration files
    // for plugin scripts, etc.
    // parmeter: callback, expected to be called with cb(err) where err is any error or null
    enablePlugin() {
        throw new Error('not overridden by plugin subclass');
    }

    // install and configure any templates for visuals in /opt/circonus/cosi/registration
    // e.g. template-dashboard-plugin_name-plugin_instance.json
    //      template-dashboard-postgres-mydbname.json
    // parmeter: callback, expected to be called with cb(err) where err is any error or null
    configurePlugin() {
        throw new Error('not overridden by plugin subclass');
    }

    // stop plugin from working and remove any non-template created files
    // e.g. remove symlinks for nad scripts, remove any configuration files, etc.
    // parmeter: callback, expected to be called with cb(err) where err is any error or null
    disablePlugin() {
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


    disable() {
        const self = this;

        this.once('disable.done', this.clean);

        this.disablePlugin((err) => {
            if (err !== null) {
                self.emit('error', err);
                return;
            }
            self.emit('disable.done');
        });
    }


    clean() {
        // find visuals
        // remove visual (using API)
        // remove registration files:
        //        e.g. template-dashboard-postgres-mydbname.json
        //             config-dashboard-postgres-mydbname.json
        //             registration-dashboard-postgres-mydbname.json
        //             meta-dashboard-postgres.json
        // update system check to remove plugin metrics

        const self = this;

        /* find all related graphs and dashboards for this plugin */
        let files = null;
        const removeMetrics = [];
        const removeFiles = [];
        const dashboardPrefix = this.dashboardPrefix || this.name;
        const graphPrefix = this.graphPrefix || this.name;
        let deconfiguredCount = 0;
        let expectCount = 0;

        try {
            files = fs.readdirSync(cosi.reg_dir);
        } catch (err) {
            this.emit(err);
            return;
        }

        for (let i = 0; i < files.length; i++) {
            const file = path.resolve(cosi.reg_dir, files[i]);

            if (files[i].indexOf(`registration-dashboard-${dashboardPrefix}`) !== -1) {
                const dash = require(file);

                for (let j = 0; j < dash.widgets.length; j++) {
                    const widget = dash.widgets[j];

                    if (widget.type === 'gauge') {
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

        // add meta file, if applicable
        const metaFile = path.resolve(path.join(cosi.reg_dir, `meta-${this.name}.json`));

        if (this._fileExists(metaFile)) {
            removeFiles.push({ type: 'meta', metaFile });
        }

        expectCount = removeFiles.length;
        self.on('item.deconfigured', () => {
            deconfiguredCount += 1;
            if (deconfiguredCount === expectCount) {
                self.emit('plugin.done');
            }
        });

        const checkRegFile = path.resolve(path.join(cosi.reg_dir, 'registration-check-system.json'));
        const check = new Check(checkRegFile);
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
        check.update((err, result) => {
            if (err) {
                self.emit(err);
                return;
            }
            console.log('Updated system check with removed metrics');

            try {
                fs.writeFileSync(checkRegFile, JSON.stringify(result, null, 4), { encoding: 'utf8', mode: 0o644, flag: 'w' });
            } catch (writeErr) {
                self.emit(writeErr);
                return;
            }

            /* now remove all the graphs and dashboards we found above */
            for (let i = 0; i < removeFiles.length; i++) {
                const fileName = removeFiles[i].file;
                const fileType = removeFiles[i].type;

                console.log(`Removing: ${fileName}`);
                if (fileType === 'meta') {
                    try {
                        fs.unlinkSync(fileName);
                    } catch (unlinkErr) {
                        console.log(chalk.yellow('WARN'), 'removing', fileName, unlinkErr);
                    }
                }

                if (fileType === 'dash') {
                    const dash = new Dashboard(fileName);

                    dash.remove((dashboardRemoveErr) => {
                        if (dashboardRemoveErr) {
                            self.emit('error', dashboardRemoveErr);
                            return;
                        }
                        self._removeRegistrationFiles(fileName);
                        self.emit('item.deconfigured');
                    });
                }

                if (fileType === 'graph') {
                    const graph = new Graph(fileName);

                    graph.remove((graphRemoveErr) => {
                        if (graphRemoveErr) {
                            self.emit('error', graphRemoveErr);
                            return;
                        }
                        self._removeRegistrationFiles(fileName);
                        self.emit('item.deconfigured');
                    });
                }
            }
        });
    }

    _removeRegistrationFiles(regFile) {
        if (regFile.indexOf('registration-') === -1) {
            throw new Error(`Invalid registration file ${regFile}`);
        }

        const cfgFile = regFile.replace('registration-', 'config-');
        const tmplFile = regFile.replace('registration-', 'template-');

        function remove(file) {
            try {
                console.log(`Removing file: ${file}`);
                fs.unlinkSync(file);
            } catch (err) {
                console.log(chalk.yellow('WARN'), 'removing', file, err);
            }
        }

        remove(regFile);
        remove(cfgFile);
        remove(tmplFile);
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

    // utility methods

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
}

module.exports = Plugin;

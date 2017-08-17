// Copyright 2016 Circonus, Inc. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

'use strict';

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
                    template-templatetype-pluginname-plugininstance.json - template-dashboard-postgres-mydbname.json
    instance        the instance of the plugin (e.g. the postgres database - used for template field expansion macro cosi.dashboard_instance)
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

    /**
     * create plugin object
     * @arg {Object} options for initialization
     *               noregister - determines whether registration step should be done (true|false) default: false
     *                            useful for running multiple plugin enablers sequentially. don't perform
     *                            registration step on each one. (e.g. cosi installer can auto-discover
     *                            supported services and pre-install/enable the plugins before doing the overall
     *                            system registration.)
     *               force - overwrite config file (default: false)
     *               iface - for protocol_observer to observe target application traffic (default: null)
     *                       set or override in subclass constructor
     */
    constructor(options) {
        super();

        this.options = options;
        this.name = null;               // set/override in subclass
        this.instance = null;           // set/override in subclass
        this.dashboardPrefix = null;    // set/override in subclass (if different from name)
        this.graphPrefix = null;        // set/override in subclass (if different from name)
        this.globalMetadata = {};       // add any global vars which should show up during registration (same level as host_* vars)
        // note: globalMetadata values are available to *all* visuals not just the plugin visuals (watch names)
        this.state = {                  // override in subclass with result of enablePlugin
            enabled: false
        };

        this.iface = null;              // set/override in subclass (if needed for protocol_observer)

        this.marker = '==========';
        this.on('error', (err) => {
            console.log(chalk.red('***************'));
            console.dir(err);
            console.log(chalk.red('***************'));
            process.exit(1); // eslint-disable-line no-process-exit
        });
    }

    /**
     * TO BE OVERRIDDEN
     * make plugin "work" e.g. symlinks for nad, daemon, configuration files for plugin scripts, etc.
     * parmeter: callback, expected to be called with cb(err) where err is any error or null
     * @returns {Undefined} nothing, uses a callback
     */
    enablePlugin() { // eslint-disable-line class-methods-use-this
        throw new Error('not overridden by plugin subclass');
    }

    /**
     * TO BE OVERRIDDEN
     * install and configure any templates for visuals in /opt/circonus/cosi/registration
     * e.g. template-dashboard-plugin_name-plugin_instance.json
     *      template-dashboard-postgres-mydbname.json
     * parmeter: callback, expected to be called with cb(err) where err is any error or null
     * @returns {Undefined} nothing, uses a callback
     */
    configurePlugin() { // eslint-disable-line class-methods-use-this
        throw new Error('not overridden by plugin subclass');
    }

    /**
     * TO BE OVERRIDDEN
     * stop plugin from working and remove any non-template created files
     * e.g. remove symlinks for nad scripts, remove any configuration files, etc.
     * parmeter: callback, expected to be called with cb(err) where err is any error or null
     * @returns {Undefined} nothing, uses a callback
     */
    disablePlugin() { // eslint-disable-line class-methods-use-this
        throw new Error('not overridden by plugin subclass');
    }

    /**
     * enable plugin
     * @returns {Undefined} nothing, emits event
     */
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


    /**
     * configure plugin
     * @returns {Undefined} nothing, emits event
     */
    configure() {
        const self = this;

        this.configurePlugin((err) => {
            if (err !== null) {
                self.emit('error', err);

                return;
            }
            // update global meta data if any has been defined in plugin
            self._updateGlobalMeta(self.globalMetadata || {});
            self.emit('configure.done');
        });
    }


    /**
     * disable plugin
     * @returns {Undefined} nothing, emits event
     */
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


    /**
     * clean up a plugin's artifacts (e.g. reset)
     * 1. find visuals
     * 2. remove visual (using API)
     * 3. remove registration files:
     *      e.g. template-dashboard-postgres-mydbname.json
     *           config-dashboard-postgres-mydbname.json
     *           registration-dashboard-postgres-mydbname.json
     *           meta-dashboard-postgres.json
     * 4. update system check to remove plugin metrics
     * @returns {Undefined} nothing, emits event
     */
    clean() {
        const self = this;

        /* find all related graphs and dashboards for this plugin */
        let files = null;
        const removeMetrics = [];
        const removeFiles = [];
        const dashboardPrefix = this.dashboardPrefix || this.name;
        let graphPrefix = null;

        if (Array.isArray(this.graphPrefix)) {
            graphPrefix = this.graphPrefix;
        } else {
            graphPrefix = [ this.graphPrefix || this.name ];
        }

        try {
            files = fs.readdirSync(cosi.reg_dir);
        } catch (err) {
            this.emit(err);

            return;
        }

        console.log(`Finding metrics & files for plugin ${this.name}`);

        for (const file_name of files) {
            const file = path.resolve(cosi.reg_dir, file_name);

            if (file_name.indexOf(`registration-dashboard-${dashboardPrefix}`) !== -1) {
                console.log(`\tFile: ${file}`);
                removeFiles.push({
                    file,
                    type: 'dash'
                });

                const dash = require(file); // eslint-disable-line global-require

                for (const widget of dash.widgets) {
                    if (widget.type === 'gauge') {
                        console.log(`\tMetric: ${widget.settings.metric_name}`);
                        removeMetrics.push(widget.settings.metric_name);
                    }
                }
            } else if (file_name.indexOf(`registration-graph-`) !== -1) {
                for (let pfxIdx = 0; pfxIdx < graphPrefix.length; pfxIdx++) {
                    if (file_name.indexOf(`registration-graph-${graphPrefix[pfxIdx]}`) !== -1) {
                        console.log(`\tFile: ${file}`);
                        removeFiles.push({
                            file,
                            type: 'graph'
                        });

                        const graph = require(file); // eslint-disable-line global-require

                        for (const dp of graph.datapoints) { // eslint-disable-line max-depth
                            if (dp.metric_name !== null) { // eslint-disable-line max-depth
                                console.log(`\tMetric: ${dp.metric_name}`);
                                removeMetrics.push(dp.metric_name);
                            }
                        }
                        break;
                    }
                }
            } else if (file_name.indexOf(`meta-dashboard-${this.name}`) !== -1) {
                console.log(`\tFile: ${file}`);
                removeFiles.push({
                    file,
                    type: 'meta'
                });
            }
        }

        this._disableUpdateCheck(removeMetrics, (err) => {
            if (err !== null) {
                self.emit('error', err);

                return;
            }

            self._disableRemoveVisuals(removeFiles, (removeErr) => {
                if (removeErr !== null) {
                    self.emit('error', removeErr);

                    return;
                }

                console.log(chalk.green('\nDisabled'), self.name, 'plugin');
            });
        });
    }

    /**
     * update global meta data with information specific to plugin
     * @arg {Object} newMetadata definition
     * @returns {Undefined} nothing
     */
    _updateGlobalMeta(newMetadata) {
        if (newMetadata === null || typeof newMetadata !== 'object' || Object.keys(newMetadata).length === 0) {
            return;
        }

        console.log('\tUpdating global meta data');

        const globalMetaFile = path.resolve(path.join(cosi.reg_dir, 'meta-global.json'));
        let meta = {};

        try {
            meta = require(globalMetaFile); // eslint-disable-line global-require
        } catch (err) {
            if (err.code !== 'MODULE_NOT_FOUND') {
                this.emit('error', err);

                return;
            }
        }

        for (const key in newMetadata) {
            if ({}.hasOwnProperty.call(newMetadata, key)) {
                meta[key] = newMetadata[key];
            }
        }

        try {
            fs.writeFileSync(globalMetaFile, JSON.stringify(meta, null, 4), {
                encoding : 'utf8',
                flag     : 'w',
                mode     : 0o644
            });
            console.log(chalk.green('\tSaved'), 'global meta data', globalMetaFile);
        } catch (err) {
            this.emit('error', err);
        }
    }


    /**
     * update system check, removing metrics for disabled plugin
     * @arg {Array} removeMetrics list of metrics to be removed
     * @arg {Function} cb callback
     * @returns {Undefined} nothing, uses a callback
     */
    _disableUpdateCheck(removeMetrics, cb) { // eslint-disable-line class-methods-use-this
        if (removeMetrics.length === 0) {
            console.log('No metrics found to remove, skipping check update');
            cb(null);

            return;
        }

        console.log('Updating system check');

        const checkRegFile = path.resolve(path.join(cosi.reg_dir, 'registration-check-system.json'));
        const check = new Check(checkRegFile);
        const checkMetrics = check.metrics;

        for (let i = 0; i < checkMetrics.length; i++) {
            for (let j = 0; j < removeMetrics.length; j++) {
                if (checkMetrics[i].name === removeMetrics[j]) {
                    console.log(`\tdisabling metric ${checkMetrics[i].name}`);
                    checkMetrics.splice(i, 1);
                    i -= 1;
                }
            }
        }

        check.metrics = checkMetrics;
        if (!{}.hasOwnProperty.call(check, 'metric_limit')) {
            check.metric_limit = 0;
        }
        console.log('\tSending updated check configuraiton to API');
        check.update().
            then((updated) => {
                check.save(checkRegFile, true);
                console.log(chalk.green('\tUpdated'), `system check ${updated.display_name}, saved`, checkRegFile);

                cb(null);
            }).
            catch((err) => {
                cb(err);
            });
    }


    /**
     * removing visuals specific to plugin when disabling plugin
     * @arg {Array} removeFiles list of visuals to be removed
     * @arg {Function} cb callback
     * @returns {Undefined} nothing, uses a callback
     */
    _disableRemoveVisuals(removeFiles, cb) {
        const self = this;

        if (removeFiles.length === 0) {
            console.log('No visuals/files found to remove, skipping');
            cb(null);

            return;
        }

        console.log('Removing files & visuals');

        this.on('next.item', () => {
            const item = removeFiles.shift();

            if (typeof item === 'undefined') {
                cb(null);

                return;
            }

            self._removeItem(item, (err) => {
                if (err !== null) {
                    cb(err);

                    return;
                }
                self.emit('next.item');
            });
        });

        this.emit('next.item');
    }

    /**
     * remove a specific plugin item/asset
     * @arg {Object} item what to remove
     * @arg {Function} cb callback
     * @returns {Undefined} nothing, uses a callback
     */
    _removeItem(item, cb) {
        const self = this;

        if (item.type === 'meta') {
            try {
                fs.unlinkSync(item.file);
                console.log(`\tRemoved file: ${item.file}`);
            } catch (unlinkErr) {
                console.log(chalk.yellow('\tWARN'), 'ignoring...', unlinkErr.toString());
            }
            cb(null); // eslint-disable-line callback-return
        } else if (item.type === 'dash') {
            const dash = new Dashboard(item.file);

            console.log('\tRemoving dashboard', dash.title);
            dash.remove().
                then(() => {
                    self._removeRegistrationFiles(item.file);
                    cb(null);
                }).
                catch((err) => {
                    cb(err);
                });
        } else if (item.type === 'graph') {
            const graph = new Graph(item.file);

            console.log('\tRemoving graph', graph.title);
            graph.remove().
                then(() => {
                    self._removeRegistrationFiles(item.file);
                    cb(null);
                }).
                catch((err) => {
                    cb(err);
                });
        }
    }

    /**
     * remove registration file for plugin assets
     * @arg {String} regFile to remove
     * @returns {Undefined} nothing, uses a callback
     */
    _removeRegistrationFiles(regFile) { // eslint-disable-line class-methods-use-this
        if (regFile.indexOf('registration-') === -1) {
            throw new Error(`Invalid registration file ${regFile}`);
        }

        const cfgFile = regFile.replace('registration-', 'config-');
        let tmplFile = regFile.replace('registration-', 'template-');

        if (regFile.match('registration-graph')) {
            const parts = regFile.split('-');

            if (parts) {
                tmplFile = path.resolve(path.join(cosi.reg_dir, `template-graph-${parts[2]}.json`));
            }
        }

        const remove = (file) => {
            try {
                fs.unlinkSync(file);
                console.log(`\t\tRemoved file: ${file}`);
            } catch (err) {
                console.log(chalk.yellow('\t\tWARN'), 'ignoring...', err.toString());
            }
        };

        remove(regFile);
        remove(cfgFile);
        remove(tmplFile);
    }


    /**
     * run registration after all assets have been configured.
     * @returns {Undefined} nothing, emits event
     */
    register() {
        if (this.options.noregister) {
            this.emit('register.done');

            return;
        }
        console.log(chalk.blue(this.marker));
        console.log('Updating registration');

        const self = this;
        const script = path.resolve(path.join(cosi.cosi_dir, 'bin', 'cosi'));
        const reg = child.spawn(script, [ 'register' ], { stdio: 'inherit' });

        reg.on('error', (err) => {
            self.emit('error', err);
        });

        reg.on('close', (code) => {
            if (code !== 0) {
                console.log(chalk.red('ERROR'), 'Registration exited with non-zero code', code);
                process.exit(code); // eslint-disable-line no-process-exit
            }
            console.log(chalk.green('Completed'), `registration for ${self.name} plugin`);
            self.emit('register.done');
        });
    }

    // utility methods

    /**
     * fetch templates specific to plugin - override in subclass if there are multiple templates to fetch
     * @returns {Undefined} nothing, emits event
     */
    fetchTemplates() {
        const self = this;
        const templateID = `dashboard-${this.name}`;
        const fetcher = new TemplateFetcher();

        console.log(`\tFetching templates for ${templateID}`);

        fetcher.template(templateID).
            then((template) => {
                const cfgFile = path.resolve(path.join(cosi.reg_dir, `template-${templateID}-${self.instance}.json`));

                template.save(cfgFile, true);
                console.log(chalk.green('\tSaved'), `template ${cfgFile}`);
                self.emit('fetch.done');
            }).
            catch((err) => {
                self.emit('error', err);
            });
    }


    /**
     * check if file exists
     * @arg {String} cfgFile to check for
     * @returns {Boolean} file exists
     */
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


    /**
     * run a shell command (to enable/disable plugin)
     * @arg {String} cmd to run
     * @arg {String} doneEvent to fire when completed
     * @returns {Undefined} nothing, emits event
     */
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

    /**
     * create protocol observer configuration (if needed)
     * @returns {Undefined} nothing
     */
    _createProtocolObserverConf() {
        // if there is no protocol observer configuration file defined, plugin is assumed to not use/need one
        if (!this.protocolObserverConf || this.protocolObserverConf === '') {
            return null;
        }

        const contents = [];

        if (cosi.agent_url && cosi.agent_url !== '') {
            contents.push(`NADURL="${cosi.agent_url}"`);
        }

        if (this.iface && this.iface !== '') {
            contents.push(`IFACE="${this.iface}"`);
        }

        try {
            fs.writeFileSync(this.protocolObserverConf, contents.join('\n'), {
                encoding : 'utf8',
                flag     : 'w',
                mode     : 0o644
            });
        } catch (err) {
            return err;
        }

        return null;
    }

}

module.exports = Plugin;

// Copyright 2016 Circonus, Inc. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

'use strict';

const child = require('child_process');
const fs = require('fs');
const http = require('http');
const path = require('path');
const url = require('url');

const chalk = require('chalk');

const cosi = require(path.resolve(path.join(__dirname, '..', '..', '..', 'cosi')));
const Plugin = require(path.resolve(path.join(cosi.lib_dir, 'plugins')));

class Postgres extends Plugin {

    /**
     * create new postgres plugin object
     * @arg {Object} options for plugin
     *               database    postgres database to use (default: postgres)
     *               port        postgresql server port (default: 5432)
     *               user        postgres user (default: postgres)
     *               pass        postgres pass (default: none)
    */
    constructor(options) {
        super(options);

        if (!{}.hasOwnProperty.call(this.options, 'database')) {
            this.options.database = 'postgres';
        }
        if (!{}.hasOwnProperty.call(this.options, 'port')) {
            this.options.port = '5432';
        }
        if (!{}.hasOwnProperty.call(this.options, 'user')) {
            this.options.user = 'postgres';
        }

        // pass has no default, leave it unset
        // psql_cmd has no default, leave it unset (to force search in PATH)

        this.name = 'postgres';
        this.longName = 'postgresql';
        this.shortName = 'pg';
        this.instance = this.options.database;
        this.dashboardPrefix = this.name;
        this.graphPrefix = [ `${this.shortName}_`, `${this.name}_protocol_observer` ];
        this.logFile = path.resolve(path.join(cosi.log_dir, `plugin-${this.name}.log`));
        this.cfgFile = path.resolve(path.join(cosi.etc_dir, `plugin-${this.name}.json`));
        this.settingsFile = path.resolve(path.join(cosi.nad_etc_dir, `${this.shortName}-conf.sh`));
        this.protocolObserverConf = path.resolve(path.join(this.nad_etc_dir, `${this.shortName}_po_conf.sh`));
        this.iface = options.iface || 'auto';
        this.execEnv = {
            COSI_PLUGIN_CONFIG_FILE : this.cfgFile,
            LOG_FILE                : this.logFile,
            NAD_SCRIPTS_DIR         : path.resolve(path.join(cosi.nad_etc_dir, 'node-agent.d')),
            PLUGIN_SCRIPTS_DIR      : path.resolve(path.join(cosi.nad_etc_dir, 'node-agent.d', this.longName)),
            PLUGIN_SETTINGS_FILE    : this.settingsFile
        };

        this.state = null;
    }

    /**
     * Overridden base class method to enable the plugin
     * @arg {Function} cb callback called with null or error
     * @returns {Undefined} nothing, uses callback
     */
    enablePlugin(cb) {
        console.log(chalk.blue(this.marker));
        console.log(`Enabling agent plugin for PostgreSQL database '${this.instance}'`);

        if (this._fileExists(this.cfgFile) && !this.options.force) {
            const err = this._loadStateConfig();

            if (err !== null) {
                cb(err);

                return;
            }

            console.log(chalk.yellow('\tPlugin scripts already enabled'), 'use --force to overwrite NAD plugin script config(s).');
            cb(null);

            return;
        }

        let err = null;

        console.log(`Verifying 'psql'`);

        err = this._test_psql();
        if (err === null) {
            console.log(chalk.green('\tPassed'), 'psql test');
            err = this._createPluginSettingsConf();
        }
        if (err === null) {
            console.log(chalk.green('\tCreated'), 'plugin config');
            err = this._createProtocolObserverConf();
        }
        if (err !== null) {
            cb(err);

            return;
        }
        console.log(chalk.green('\tCreated'), 'protocol_observer config');

        this.activatePluginScripts(cb);
    }


    /**
     * Overridden base class method to configure the plugin
     * @arg {Function} cb callback called with null or error
     * @returns {Undefined} nothing, uses callback
     */
    configurePlugin(cb) {
        console.log(chalk.blue(this.marker));
        console.log('Configuring plugin for registration');

        const self = this;

        this.once('newmetrics.done', this.fetchTemplates);
        this.once('fetch.done', this.preConfigDashboard);
        this.once('preconfig.done', (err) => {
            if (err !== null) {
                cb(err);

                return;
            }
            cb(null);
        });

        this.addCustomMetrics((err) => {
            if (err !== null) {
                cb(err);

                return;
            }
            self.emit('newmetrics.done');
        });
    }


    /**
     * Overridden base class method to disable the plugin
     * @arg {Function} cb callback called with null or error
     * @returns {Undefined} nothing, uses callback
     */
    disablePlugin(cb) {
        if (!fs.existsSync(this.pg_conf_file)) {
            console.log(chalk.yellow('WARN'), `PostgreSQL plugin configuration not found, plugin may already be disabled. ${this.pg_conf_file}`);
            if (!this.options.force) {
                process.exit(0);
            }
        }
        console.log(chalk.blue(this.marker));
        console.log(`Disabling agent plugin for PostgreSQL'`);

        // disable the postgres plugin scripts and attempt to stop protocol observer if applicable
        const script = path.resolve(path.join(__dirname, 'nad-disable.sh'));
        const options = { env: this.execEnv };
        const self = this;

        child.exec(script, options, (error, stdout, stderr) => { // eslint-disable-line no-unused-vars
            if (error !== null) {
                cb(new Error(`${stderr} (exit code ${error.code})`));

                return;
            }

            try {
                fs.unlinkSync(self.settingsFile);
                console.log(`\tRemoved config file: ${self.settingsFile}`);
            } catch (unlinkErr) {
                console.log(chalk.yellow('\tWARN'), 'ignoring...', unlinkErr.toString());
            }

            try {
                fs.unlinkSync(self.protocolObserverConf);
                console.log(`\tRemoved config file: ${self.protocolObserverConf}`);
            } catch (unlinkErr) {
                console.log(chalk.yellow('\tWARN'), 'ignoring...', unlinkErr.toString());
            }

            console.log(chalk.green('\tDisabled'), 'agent plugin for PostgreSQL');

            cb(null);
        });
    }


    /**
     * called by enable plugin to activate the individual plugin scripts
     * @arg {Function} cb callback called with null or error
     * @returns {Undefined} nothing, uses callback
     */
    activatePluginScripts(cb) {
        console.log('\tActivating PostgreSQL plugin scripts');

        const self = this;

        // enable the postgresql plugin scripts
        const script = path.resolve(path.join(__dirname, 'nad-enable.sh'));
        const options = { env: this.execEnv };

        child.exec(script, options, (error, stdout, stderr) => { // eslint-disable-line no-unused-vars
            if (error !== null) {
                cb(new Error(`${stderr} (exit code ${error.code})`));

                return;
            }

            const err = self._loadStateConfig();

            if (err !== null) {
                cb(err);

                return;
            }

            console.log(chalk.green('\tEnabled'), 'agent plugin for PostgreSQL');

            cb(null);
        });
    }

    /**
     * called by enable plugin to activate metrics used in plugin visuals
     * @arg {Function} cb callback called with null or error
     * @returns {Undefined} nothing, uses callback
     */
    addCustomMetrics(cb) {
        if (!this.state.protocol_observer) {
            cb(null);

            return;
        }

        /*
           in addition to what was discovered through the node-agent query, we will
           have additional metrics provided by the protocol_observer for postgres.

           since the arrival of these additional metrics is based on stimulus to
           the postgres server itself, we have to fake their existence into the node agent
           by writing blank values.
        */
        const po = {};
        const types = [ 'Query', 'Execute', 'Bind' ];
        const seps = [ '`', '`SELECT`', '`INSERT`', '`UPDATE`', '`DELETE`' ];
        const atts = [ 'latency', 'request_bytes', 'response_bytes', 'response_rows' ];

        for (const type of types) {
            for (const sep of seps) {
                for (const att of atts) {
                    const key = `${type}${sep}${att}`;

                    if (!{}.hasOwnProperty.call(po, key)) {
                        po[key] = { _type: 'n', _value: null };
                    }
                }
            }
        }

        let agent_url = cosi.agent_url;

        if (!agent_url.endsWith('/')) {
            agent_url += '/';
        }
        agent_url += 'write/postgres_protocol_observer';

        const options = url.parse(agent_url);

        options.method = 'POST';

        console.log(`\tSending new metrics to ${options.href}`);

        const req = http.request(options, (res) => {
            let body = '';

            res.on('data', (chunk) => {
                body += chunk;
            });

            res.on('end', () => {
                if (res.statusCode !== 200) {
                    cb(new Error(`NAD non-200 response ${res.statusCode} ${res.statusMessage} body: ${body}`));

                    return;
                }
                console.log(chalk.green('\tAdded'), 'new metrics for protocol_observer.');
                cb(null);
            });
        });

        req.write(JSON.stringify(po));
        req.end();
    }

    /**
     * load fs metrics (to determine where db data is stored)
     * @arg {Function} cb callback called with null or error
     * @returns {Undefined} nothing, uses callback
     */
    loadFSMetrics(cb) { // eslint-disable-line class-methods-use-this
        console.log('\t\tLoading FS metrics');

        http.get(`${cosi.agent_url}run/fs`, (res) => {
            let data = '';

            res.on('data', (chunk) => {
                data += chunk;
            });

            res.on('end', () => {
                try {
                    const metrics = JSON.parse(data);

                    cb(null, metrics); // eslint-disable-line callback-return
                } catch (err) {
                    cb(err); // eslint-disable-line callback-return
                }
            });
        }).on('error', (err) => {
            cb(err);
        });
    }

    /**
     * configures dashboard forecast widget for db data fs mount point
     * @arg {Function} cb callback called with null or error
     * @returns {Undefined} nothing, uses callback
     */
    configForecastWidgets(cb) {
        console.log(chalk.bold('\tConfiguring forecast widgets'));

        // verify that any settings required to find metrics are present
        if (this.state.fs_mount === '') {
            console.log('\t\tfs_mount not set from enable, skipping.');
            cb(null);

            return;
        }

        const cfgFile = path.resolve(path.join(cosi.reg_dir, `template-dashboard-${this.name}-${this.instance}.json`));
        let cfg = null;

        try {
            cfg = require(cfgFile); // eslint-disable-line global-require
        } catch (loadErr) {
            console.error(chalk.red('ERROR'), `loading dashboard template ${cfgFile}`, loadErr);
            process.exit(1);
        }

        if (!{}.hasOwnProperty.call(cfg, 'config')) {
            console.error(chalk.red('ERROR'), `invalid template, no 'config' property ${cfgFile}`);
            process.exit(1);
        }

        if (!{}.hasOwnProperty.call(cfg.config, 'widgets')) {
            console.error(chalk.red('ERROR'), `invalid template, no 'widgets' in config property ${cfgFile}`);
            process.exit(1);
        }

        const rx = new RegExp(`(.*\`)?${this.state.fs_mount}\`(df_)?used_percent`);

        // this can be expanded to do all metrics but ATM all we need is fs metrics to match state.fs_mount
        this.loadFSMetrics((err, metrics) => {
            if (err !== null) {
                cb(err);

                return;
            }

            if (metrics === null || !{}.hasOwnProperty.call(metrics, 'fs')) {
                console.log('\t\tNo FS metrics returned from agent, skipping');
                cb(null);

                return;
            }

            let metricName = null;

            for (const metric in metrics.fs) {
                if (rx.test(metric)) {
                    metricName = `fs\`${metric}`;
                    break;
                }
            }

            if (metricName === null) {
                console.log(`\t\tDid not find a metric matching '${this.state.fs_mount}'`);
                cb(null);

                return;
            }

            console.log(`\t\tFound metric '${metricName}'`);

            for (const widget of cfg.config.widgets) {
                if (widget.type !== 'forecast') {
                    continue;
                }
                if ({}.hasOwnProperty.call(widget.settings, 'metrics') && Array.isArray(widget.settings.metrics)) {
                    for (let j = 0; j < widget.settings.metrics.length; j++) {
                        if (widget.settings.metrics[j] === 'fs_mount') {
                            console.log(`\t\tFound widget '${widget.settings.title}', setting metric name`);
                            widget.settings.metrics[j] = metricName;
                        }
                    }
                }
            }

            try {
                fs.writeFileSync(cfgFile, JSON.stringify(cfg, null, 4), {
                    encoding : 'utf8',
                    flag     : 'w',
                    mode     : 0o644
                });
            } catch (saveErr) {
                cb(saveErr);

                return;
            }

            cb(null);
        });
    }


    /**
     * pre-configures dashboard template so that the registration run will succeed
     * @returns {Undefined} nothing, emits event
     */
    preConfigDashboard() {
        const metaErr = this._createMetaConf();

        if (metaErr !== null) {
            this.emit('preconfig.done', metaErr);

            return;
        }

        console.log(chalk.green(`\tSaved`), 'meta configuration');

        this.configForecastWidgets((cfgErr) => {
            this.emit('preconfig.done', cfgErr);
        });
    }

    /**
     * attempt to locate the `psql` command
     * @arg {String} psql_cmd custom psql command location, if any
     * @returns {String} command or exits if not found
     */
    _find_psql_command(psql_cmd) { // eslint-disable-line class-methods-use-this
        let cmd = psql_cmd;

        if (cmd === null || cmd === '') {
            let output = null;

            try {
                output = child.execSync('command -v psql');
            } catch (err) {
                console.error(`Unable to find 'psql' in '${process.env.PATH}', specify with --psql_cmd`, err);
                process.exit(1);
            }
            cmd = output.toString().trim();
        }

        if (!fs.existsSync(cmd)) {
            console.error(`'${cmd}' does not exist`);
            process.exit(1);
        }

        return cmd;
    }

    /**
     * verify the `psql` command functions as configured
     * @arg {String} psql_cmd custom psql command location, if any
     * @returns {Undefined} null if ok, or exits if not found
     */
    _test_psql() {
        const psql_cmd = this._find_psql_command(this.options.psql_cmd || null);
        let psql_test_stdout = null;

        try {
            psql_test_stdout = child.execSync(`${psql_cmd} -V`);
        } catch (err) {
            console.error(`Error running '${psql_cmd} -V', unable to verify psql. ${err}`);
            process.exit(1);
        }

        if (!psql_test_stdout || psql_test_stdout.toString().indexOf('PostgreSQL') === -1) {
            console.error(`Unexpected output from '${psql_cmd} -V', unable to verify psql. (${psql_test_stdout.toString()})`);
            process.exit(1);
        }

        this.options.psql_cmd = psql_cmd;

        return null;
    }


    /**
     * create meta data config to use during registration of plugin visuals
     * @returns {Object} error or null
     */
    _createMetaConf() {
        const metaFile = path.resolve(path.join(cosi.reg_dir, `meta-dashboard-${this.name}-${this.instance}.json`));
        const meta = { sys_graphs: [] };

        /*
            using sys_graphs mapping: (sadly, it ties the code to the dashboard template atm)
                dashboard_tag - the tag from the widget in the dashboard template
                metric_group - the system metrics group (e.g. fs, vm, cpu, etc.)
                metric_item - the specific item (for a variable graph) or null
                graph_instance - the graph instance (some graph templates produce mulitple graphs) # or 0|null default: null

            for example:
                dashboard_tag: 'database:file_system_space'
                metric_group: 'fs'
                metric_item: '/'
                graph_instance: null

            would result in the graph in registration-graph-fs-0-_.json being used for the widget
            which has the tag database:file_system_space on the postgres dashboard
        */
        if (this.state.fs_mount && this.state.fs_mount !== '') {
            meta.sys_graphs.push({
                dashboard_tag  : 'database:file_system_space',
                graph_instance : null,
                metric_group   : 'fs',
                metric_item    : this.state.fs_mount.replace(/[^a-z0-9\-_]/ig, '_')
            });
        }

        try {
            fs.writeFileSync(metaFile, JSON.stringify(meta, null, 4), {
                encoding : 'utf8',
                flag     : 'w',
                mode     : 0o644
            });
        } catch (err) {
            return err;
        }

        return null;
    }

    /**
     * creates the settings file for the plugin's shell commands
     * @returns {Object} error or null
     */
    _createPluginSettingsConf() {
        // create config for postgres plugin scripts
        const cfgFile = this.settingsFile;
        const contents = [];

        contents.push(`export PSQL_CMD=${this.options.psql_cmd}`);

        if (this.options.user !== '') {
            contents.push(`export PGUSER=${this.options.user}`);
        }
        if (this.options.database !== '') {
            contents.push(`export PGDATABASE=${this.options.database}`);
        }
        if (this.options.port !== '') {
            contents.push(`export PGPORT=${this.options.port}`);
        }
        if (this.options.pass !== '') {
            contents.push(`export PGPASS=${this.options.pass}`);
        }

        try {
            fs.writeFileSync(cfgFile, contents.join('\n'), {
                encoding : 'utf8',
                flag     : 'w',
                mode     : 0o644
            });
        } catch (err) {
            return err;
        }

        return null;
    }

    /**
     * load current plugin state configuration if it exists
     * @returns {Object} error or null
     */
    _loadStateConfig() {
        let state = null;

        console.log(`\tLoading plugin configuration ${this.cfgFile}`);
        try {
            state = require(this.cfgFile); // eslint-disable-line global-require
        } catch (err) {
            if (err.code === 'MODULE_NOT_FOUND') {
                return new Error('Plugin configuration not found');
            }

            return new Error(`Parsing plugin configuration ${err}`);
        }

        if (state === null || state.enabled === false) {
            return new Error(`Failed to enable plugin (see ${this.cfgFile})`);
        }

        this.state = state;

        return null;
    }

}

module.exports = Postgres;

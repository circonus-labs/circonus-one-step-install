'use strict';

/* eslint-env node, es6 */
/* eslint-disable no-magic-numbers, global-require, camelcase */

const fs = require('fs');
const path = require('path');
const child = require('child_process');

const chalk = require('chalk');
const client = require('request');

const cosi = require(path.resolve(path.join(__dirname, '..', '..', '..', 'cosi')));
const Plugin = require(path.resolve(path.join(cosi.lib_dir, 'plugins')));

class Postgres extends Plugin {

    constructor(params) {
        super(params);
        this.name = 'postgres';
        this.dashboardPrefix = 'postgres';
        this.graphPrefix = 'pg_';
        this.state = null;
    }

    enablePlugin(cb) {
        console.log(chalk.blue(this.marker));
        console.log('Enabling agent plugin for PostgreSQL');

        let err = null;

        err = this._test_psql();
        if (err === null) {
            console.log(chalk.green('\tPassed'), 'psql test');
            err = this._create_plugin_conf();
        }
        if (err === null) {
            console.log(chalk.green('\tCreated'), 'plugin config');
            err = this._create_observer_conf();
        }
        if (err !== null) {
            cb(err);
            return;
        }
        console.log(chalk.green('\tCreated'), 'protocol_observer config');

        this.activatePluginScripts(cb);
    }

    activatePluginScripts(cb) {
        console.log('\tActivating PostgreSQL plugin scripts');

        const self = this;

        // enable the postgres plugin scripts and attempt to start protocol observer if applicable
        const script = path.resolve(path.join(__dirname, 'nad-enable.sh'));

        child.exec(script, (error, stdout, stderr) => {
            if (error) {
                cb(new Error(`${error} ${stderr}`), null);
                return;
            }

            let state = null;

            try {
                state = JSON.parse(stdout);
            } catch (parseErr) {
                cb(new Error(`Parsing enable script stdout ${parseErr} '${stdout}'`), null);
                return;
            }

            if (state === null || state.enabled === false) {
                cb(new Error(`Failed to enable plugin ${stdout}`));
                return;
            }

            self.state = state;

            console.log(chalk.green('\tEnabled'), 'agent plugin for PostgreSQL');

            cb(null);
            return;
        });
    }

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
            return;
        });

        this.addCustomMetrics((err) => {
            if (err !== null) {
                cb(err);
                return;
            }
            self.emit('newmetrics.done');
        });
    }

    addCustomMetrics(cb) { // eslint-disable-line consistent-return

        if (!this.protocol_observer) {
            return cb(null);
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

            // for (const type of types) {
        for (let i = 0; i < types.length; i++) {
            const type = types[i];

                // for (const sep of seps ) {
            for (let j = 0; j < seps.length; j++) {
                const sep = seps[j];

                    // for (const att of atts) {
                for (let k = 0; k < atts.length; k++) {
                    const att = atts[k];
                    const key = type + sep + att;

                    if (!{}.hasOwnProperty.call(po, key)) {
                        po[key] = { _type: 'n', _value: null };
                    }
                }
            }
        }

        let url = cosi.agent_url;

        if (!url.endsWith('/')) {
            url += '/';
        }
        url += 'write/postgres_protocol_observer';
        console.log(`\tSending new metrics to ${url}`);

        client.post(url, { json: po }, (error, response, body) => {
            if (error || response.statusCode !== 200) {
                return cb(new Error(`${error} ${body}`));
            }
            console.log(chalk.green('Added'), 'new metrics for protocol_observer.');
            return cb(null);
        });
    }


    preConfigDashboard() {
        const err = this._create_meta_conf();

        if (err === null) {
            console.log(chalk.green(`\tSaved`), 'meta configuration');
            this.emit('preconfig.done', null);
        } else {
            this.emit('preconfig.done', err);
        }

    }

    // _configPostgres(stdout) {
    //     console.log(chalk.blue(this.marker));
    //     console.log('Configuring visuals for plugin');
    //
    //     const self = this;
    //
    //     /*
    //     if we have gotten here, nad-enable.sh has flipped on the postgres plugin and
    //     tested it to work.. it has passed us the output of nad-enable.sh which should
    //     contain the data_dir
    //     */
    //
    //     const nadPluginOutput = JSON.parse(stdout);
    //
    //     this.once('register.done', () => {
    //         const files = fs.readdirSync(cosi.reg_dir);
    //
    //         /* algorithm here is to substring search for the nadPluginOutput.data_dir in
    //            each registered graph's datapoints's metric_names.  If we find a substring
    //            match then that is our filesystem graph choice.
    //
    //            If we don't get a match, slice off the last folder and redo search until
    //            we find some reasonable matching filesystem graph
    //            */
    //         let dataDir = nadPluginOutput.data_dir;
    //         let fsGraphId = null;
    //
    //         while (dataDir.length) {
    //             // for (const file of files) {
    //             for (let i = 0; i < files.length; i++) {
    //                 const file = files[i];
    //
    //                 if (!file.match(/^registration-graph-fs-([^.]+)+\.json?$/)) {
    //                     continue;
    //                 }
    //
    //                 const configFile = path.resolve(cosi.reg_dir, file);
    //                 let graph = null;
    //
    //                 try {
    //                     graph = require(configFile);
    //                 } catch (err) {
    //                     console.log(chalk.yellow('WARN'), `${err}, skipping ${configFile}`);
    //                     continue;
    //                 }
    //
    //                 for (let j = 0; j < graph.datapoints.length; j++) {
    //                     if (graph.datapoints[j].metric_name !== null && graph.datapoints[j].metric_name.indexOf(dataDir) > -1) {
    //                         fsGraphId = graph._cid.replace('/graph/', '');
    //                         break;
    //                     }
    //                 }
    //
    //                 if (fsGraphId !== null) {
    //                     break;
    //                 }
    //             }
    //             if (fsGraphId !== null) {
    //                 break;
    //             }
    //             dataDir = dataDir.slice(0, dataDir.lastIndexOf('/'));
    //         }
    //         self.emit('dashboard.create', fsGraphId);
    //     });
    //
    //     this.once('dashboard.create', (fsGraphId) => {
    //         self.once('dashboard.done', () => {
    //             self.emit('plugin.done');
    //         });
    //         self.configDashboard('postgres', self.params.quiet, [ self.params.pgdb ], fsGraphId);
    //     });
    //
    //     if (nadPluginOutput.enabled) {
    //         this.protocol_observer = nadPluginOutput.protocol_observer;
    //         this.reregisterHost();
    //     }
    // }


    _test_psql() {
        let psql_test_stdout = null;

        try {
            psql_test_stdout = child.execSync('psql -V');
        } catch (err) {
            return err;
        }

        if (!psql_test_stdout || psql_test_stdout.indexOf('PostgreSQL') === -1) {
            return new Error("Cannot find 'psql' in PATH, postgres plugin will not work");
        }

        return null;
    }

    _create_meta_conf() {
        const metaFile = path.resolve(path.join(cosi.reg_dir, `meta-dashboard-${this.name}.json`));
        const meta = {
            items: [],
            sys_graphs: []
        };

        if (this.params.database && this.params.database !== '') {
            meta.items = [ this.params.database ];
        }

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

            TODO tie item to sys_graphs so different sets of sys_graphs can be used for each item.
            the current postgres plugin doesn't support multiple databases concurrently (in a way
            that this dashboard stuff works) so, this is pushed off as an enhancement to simplify
            the code for initial release
        */
        if (this.state.fs_mount && this.state.fs_mount !== '') {
            meta.sys_graphs.push({
                dashboard_tag: 'database:file_system_space',
                metric_group: 'fs',
                metric_item: this.state.fs_mount.replace(/[^a-z0-9\-_]/ig, '_'),
                graph_instance: null
            });
        }

        if (meta.items.length > 0 || meta.sys_graphs.length > 0) {
            try {
                fs.writeFileSync(metaFile, JSON.stringify(meta, null, 4), { encoding: 'utf8', mode: 0o644, flag: 'w' });
            } catch (err) {
                return err;
            }
        }

        return null;
    }

    _create_plugin_conf() {
        // create config for postgres plugin scripts
        const pg_conf_file = '/opt/circonus/etc/pg-conf.sh';
        const contents = [];

        if (this.params.user !== '') {
            contents.push(`export PGUSER=${this.params.user}`);
        }
        if (this.params.database !== '') {
            contents.push(`export PGDATABASE=${this.params.database}`);
        }
        if (this.params.port !== '') {
            contents.push(`export PGPORT=${this.params.port}`);
        }
        if (this.params.pass !== '') {
            contents.push(`export PGPASSWORD=${this.params.pass}`);
        }

        try {
            fs.writeFileSync(
                pg_conf_file,
                contents.join('\n'),
                { encoding: 'utf8', mode: 0o644, flag: 'w' }
            );
        } catch (err) {
            return err;
        }

        return null;
    }

    _create_observer_conf() {
        // create protocol observer config
        const pg_po_conf_file = '/opt/circonus/etc/pg-po-conf.sh';
        const contents = [];

        if (cosi.agent_url !== '') {
            contents.push(`NADURL="${cosi.agent_url}"`);
        }

        try {
            fs.writeFileSync(
                pg_po_conf_file,
                contents.join('\n'),
                { encoding: 'utf8', mode: 0o644, flag: 'w' }
            );
        } catch (err) {
            return err;
        }

        return null;
    }


    disable() {
        this.disablePlugin('postgres', 'postgres', 'pg_');
    }
}

module.exports = Postgres;

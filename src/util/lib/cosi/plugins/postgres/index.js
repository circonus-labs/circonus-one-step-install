'use strict';

/* eslint-env node, es6 */

const fs = require('fs');
const path = require('path');
const child = require('child_process');

const chalk = require('chalk');
const client = require('request');

const cosi = require(path.resolve(path.join(__dirname, '..', '..', '..', 'cosi')));
const Plugin = require(path.resolve(path.join(cosi.lib_dir, 'plugins')));

/* Note:

The postgres plugin is capable of using protocol_observer to track wire latency metrics
pertaining to postgres. protocol_obserer is not included/installed as part of NAD or COSI.
It must be supplied locally. Example install for CentOS:

```
# install go (if needed)
curl "https://storage.googleapis.com/golang/go1.7.1.linux-amd64.tar.gz" -O
tar -C /usr/local -xzf go1.7.1.linux-amd64.tar.gz
export PATH="$PATH:/usr/local/go/bin"

# setup go environment (if needed)
mkdir godev && cd godev && mkdir bin pkg src
export GOPATH=$(pwd)

# install required header for wirelatency
yum install -y libpcap-devel

# get the wirelatency source (and dependencies)
go get github.com/circonus-labs/wirelatency

# build
cd $GOPATH/src/github.com/circonus-labs/wirelatency/protocol_observer
go build

# copy resulting protocol_observer binary somewhere in $PATH so the plugin can find it
```

*/
class Postgres extends Plugin {

    /* options:
        database    postgres database to use (default: postgres)
        port        postgresql server port (default: 5432)
        user        postgres user (default: postgres)
        pass        postgres pass (default: none)
    */
    constructor(options) {
        super(options);
        this.name = 'postgres';
        this.instance = this.options.database;
        this.dashboardPrefix = 'postgres';
        this.graphPrefix = 'pg_';
        this.state = null;

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
    }

    enablePlugin(cb) {
        console.log(chalk.blue(this.marker));
        console.log(`Enabling agent plugin for PostgreSQL database '${this.intance}'`);

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


    disablePlugin(cb) {
        console.log(chalk.blue(this.marker));
        console.log(`Disabling agent plugin for PostgreSQL'`);

        // disable the postgres plugin scripts and attempt to stop protocol observer if applicable
        const script = path.resolve(path.join(__dirname, 'nad-disable.sh'));

        child.exec(script, (error, stdout, stderr) => {
            if (error) {
                cb(new Error(`${error} ${stdout} ${stderr}`), null);
                return;
            }

            const pgConfFile = path.resolve(path.join(cosi.cosi_dir, '..', 'etc', 'pg-conf.sh'));

            try {
                fs.unlinkSync(pgConfFile);
                console.log(`\tRemoved file: ${pgConfFile}`);
            } catch (unlinkErr) {
                console.log(chalk.yellow('\tWARN'), 'ignoring...', unlinkErr.toString());
            }


            const pgPoConfFile = path.resolve(path.join(cosi.cosi_dir, '..', 'etc', 'pg-po-conf.sh'));

            try {
                fs.unlinkSync(pgPoConfFile);
                console.log(`\tRemoved file: ${pgPoConfFile}`);
            } catch (unlinkErr) {
                console.log(chalk.yellow('\tWARN'), 'ignoring...', unlinkErr.toString());
            }

            console.log(chalk.green('\tDisabled'), 'agent plugin for PostgreSQL');

            cb(null);
            return;
        });
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
                dashboard_tag: 'database:file_system_space',
                metric_group: 'fs',
                metric_item: this.state.fs_mount.replace(/[^a-z0-9\-_]/ig, '_'),
                graph_instance: null
            });
        }

        try {
            fs.writeFileSync(metaFile, JSON.stringify(meta, null, 4), { encoding: 'utf8', mode: 0o644, flag: 'w' });
        } catch (err) {
            return err;
        }

        return null;
    }

    _create_plugin_conf() {
        // create config for postgres plugin scripts
        const pg_conf_file = '/opt/circonus/etc/pg-conf.sh';
        const contents = [];

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
            contents.push(`export PGPASSWORD=${this.options.pass}`);
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
}

module.exports = Postgres;

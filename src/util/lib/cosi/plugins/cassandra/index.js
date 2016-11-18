'use strict';

/* eslint-env node, es6 */

const child = require('child_process');
const fs = require('fs');
const http = require('http');
const path = require('path');
const url = require('url');

const chalk = require('chalk');

const cosi = require(path.resolve(path.join(__dirname, '..', '..', '..', 'cosi')));
const Plugin = require(path.resolve(path.join(cosi.lib_dir, 'plugins')));
const TemplateFetcher = require(path.resolve(path.join(cosi.lib_dir, 'template', 'fetch')));
const Metrics = require(path.join(cosi.lib_dir, 'metrics'));

/* Note:

The cassandra plugin is capable of using protocol_observer to track wire latency metrics
pertaining to cassandra. protocol_obserer is not included/installed as part of NAD or COSI.
It must be supplied locally. Example install for CentOS:

```
# install go (if needed)
curl "https://storage.googleapis.com/golang/go1.7.1.linux-amd64.tar.gz" -O
tar -C /usr/local -xzf go1.7.1.linux-amd64.tar.gz
export PATH="$PATH:/usr/local/go/bin"

# setup go environment (if needed)
mkdir godev && cd godev && mkdir bin pkg src
export GOPATH=$(pwd)

# install required headers and libs for wirelatency
yum install -y libpcap-devel

# get the wirelatency source (and dependencies)
go get github.com/circonus-labs/wirelatency

# build
cd $GOPATH/src/github.com/circonus-labs/wirelatency/protocol_observer
go build

# copy resulting protocol_observer binary somewhere in $PATH so the plugin can find it
# or to the default location of /opt/circonus/bin/protocol_observer
cp protocol_observer /opt/circonus/bin

Note that if you run NAD with dropped permissions, you will need to ensure that the user
you drop NAD to has sudo access to protocol_observer.  This is required because protocol_observer
uses libpcap to capture packets and observe the protocol.
```

*/
class Cassandra extends Plugin {

    constructor(options) {
        super(options);
        this.name = 'cassandra';
        this.instance = 'cassandra';
        this.dashboardPrefix = 'cassandranode';
        this.graphPrefix = [ 'cassandra_', 'cassandra_protocol_observer' ];
        this.enableClusters = false;
        this.logFile = path.resolve(path.join(cosi.log_dir, `plugin-${this.name}.log`));
        this.cfgFile = path.resolve(path.join(cosi.etc_dir, `plugin-${this.name}.json`));
        this.iface = options.iface || 'auto';
    }


    enablePlugin(cb) {
        console.log(chalk.blue(this.marker));
        console.log('Enabling agent plugin for Cassandra database');

        if (this._fileExists(this.cfgFile) && !this.options.force) {
            console.log(chalk.green('\tPlugin scripts already enabled'), 'use --force to overwrite NAD plugin script config(s).');
            cb(null);
            return;
        }

        let err = null;

        err = this._test_nodetool();
        if (err === null) {
            console.log(chalk.green('\tPassed'), 'nodetool test');
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
        console.log(`Disabling agent plugin for Cassandra`);

        // disable the cassandra plugin scripts and attempt to stop protocol observer if applicable
        const script = path.resolve(path.join(__dirname, 'nad-disable.sh'));

        child.exec(script, (error, stdout, stderr) => {
            if (error) {
                cb(new Error(`${error} ${stdout} ${stderr}`), null);
                return;
            }

            const cassPoConfFile = path.resolve(path.join(cosi.cosi_dir, '..', 'etc', 'cass-po-conf.sh'));

            try {
                fs.unlinkSync(cassPoConfFile);
                console.log(`\tRemoved file: ${cassPoConfFile}`);
            } catch (unlinkErr) {
                console.log(chalk.yellow('\tWARN'), 'ignoring...', unlinkErr.toString());
            }

            console.log(chalk.green('\tDisabled'), 'agent plugin for Cassandra');

            cb(null);
            return;
        });
    }


    // support methods


    fetchTemplates() {
        const self = this;
        const templateID = 'dashboard-cassandranode';
        const fetcher = new TemplateFetcher();

        console.log(`\tFetching ${templateID} template`);

        fetcher.template(templateID, (err, template) => {
            if (err !== null) {
                self.emit('error', err);
                return;
            }

            const cfgFile = path.resolve(path.join(cosi.reg_dir, `template-${templateID}-${self.instance}.json`));

            template.save(cfgFile, true);
            console.log(chalk.green('\tSaved'), `template ${cfgFile}`);

            if (!self.enableClusters) {
                self.emit('fetch.done');
                return;
            }

            const clusterTemplateID = 'dashboard-cassandracluster';

            console.log(`\tFetching ${clusterTemplateID} template`);
            fetcher.template(clusterTemplateID, (clusterErr, clusterTemplate) => {
                if (clusterErr !== null) {
                    self.emit('error', clusterErr);
                    return;
                }

                const clusterCfgFile = path.resolve(path.join(cosi.reg_dir, `template-${clusterTemplateID}-${self.instance}.json`));

                clusterTemplate.save(clusterCfgFile, true);
                console.log(chalk.green('\tSaved'), `template ${clusterCfgFile}`);
                self.emit('fetch.done');
            });
        });
    }


    activatePluginScripts(cb) {
        console.log('\tActivating Cassandra plugin scripts - this may take a few minutes...');

        const self = this;

        // enable the cassandra plugin scripts and attempt to start protocol observer if applicable
        const script = path.resolve(path.join(__dirname, 'nad-enable.sh'));
        const options = {
            env: {
                NAD_SCRIPTS_DIR: path.resolve(path.join(cosi.cosi_dir, '..', 'etc', 'node-agent.d')),
                NAD_PLUGIN_CONFIG_FILE: this.cfgFile
            }
        };

        child.exec(`${script} | tee -a ${this.logFile}`, options, (error, stdout, stderr) => {
            if (error) {
                cb(new Error(`${error} ${stderr}`), null);
                return;
            }

            let state = null;

            console.log(`\tLoading plugin configuration ${self.cfgFile}`);
            try {
                state = JSON.parse(fs.readFileSync(self.cfgFile));
            } catch (parseErr) {
                if (parseErr.code === 'MODULE_NOT_FOUND') {
                    cb(new Error('Plugin configuration not found'));
                    return;
                }
                cb(new Error(`Parsing plugin configuration ${parseErr}`), null);
                return;
            }

            if (state === null || state.enabled === false) {
                cb(new Error(`Failed to enable plugin ${stdout}`));
                return;
            }

            state.cluster_name = state.cluster_name.trim();
            console.log('\tAdding cluster_name to global meta data');
            self.globalMetadata.cluster_name = state.cluster_name;
            console.log('\tAdding cluster_tag to global meta data');
            self.globalMetadata.cluster_tag = `cluster:${state.cluster_name}`.toLowerCase();

            self.state = state;

            console.log(chalk.green('\tEnabled'), 'agent plugin for Cassandra');

            cb(null);
        });
    }


    addCustomMetrics(cb) { // eslint-disable-line consistent-return

        if (!this.state.protocol_observer) {
            return cb(null);
        }

        /*
           in addition to what was discovered through the node-agent query, we will
           have additional metrics provided by the protocol_observer for cassandra.

           since the arrival of these additional metrics is based on stimulus to
           the cassandra server itself, we have to fake their existence into the node agent
           by writing blank values.
        */
        const po = {};

        const types = [ 'Query', 'Execute', 'Prepare' ];
        const seps = [ '`' ];
        const atts = [ 'latency', 'request_bytes', 'response_bytes' ];

        for (const type of types) {
            for (const sep of seps) {
                for (const att of atts) {
                    const key = type + sep + att;

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
        agent_url += 'write/cassandra_protocol_observer';

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
                return;
            });
        });

        req.write(JSON.stringify(po));
        req.end();
    }


    _loadMetrics(cb) {
        const metricsLoader = new Metrics(cosi.agent_url);

        metricsLoader.getMetrics((err, metrics) => {
            if (err) {
                cb(err);
                return;
            }
            cb(null, metrics);
        });
    }


    _createMetricTags(metrics, cb) {
        if (!{}.hasOwnProperty.call(this.globalMetadata, 'cluster_tag')) {
            cb(null);
            return;
        }

        // !! note: all tags will be *forced* to lower case by API !!
        const metricTagsFile = path.resolve(path.join(cosi.reg_dir, 'metric-tags.json'));
        let metric_tags = {};

        console.log(`\tAdding metric tag(s) (${this.globalMetadata.cluster_tag}) ${metricTagsFile}`);

        try {
            metric_tags = require(metricTagsFile); // eslint-disable-line global-require
        } catch (err) {
            if (err.code !== 'MODULE_NOT_FOUND') {
                cb(err);
                return;
            }
            // otherwise ignore, creating a new metric tag file
        }

        for (const metricGroup in metrics) { // eslint-disable-line guard-for-in
            if (!(/^cassandra_/).test(metricGroup)) {
                continue;
            }
            for (const metricName in metrics[metricGroup]) { // eslint-disable-line guard-for-in
                const fullMetricName = `${metricGroup}\`${metricName}`;
                let metricTags = metric_tags[fullMetricName];

                if (!Array.isArray(metricTags)) {
                    metricTags = [];
                }

                if (metricTags.indexOf(this.globalMetadata.cluster_tag) === -1) {
                    metricTags.push(this.globalMetadata.cluster_tag);
                    metric_tags[fullMetricName] = metricTags;
                }
            }
        }

        try {
            fs.writeFileSync(metricTagsFile, JSON.stringify(metric_tags, null, 4), { encoding: 'utf8', mode: 0o644, flag: 'w' });
        } catch (err) {
            cb(err);
            return;
        }

        cb(null, metricTagsFile);
    }


    _addCFGraphs(metrics, cb) {
        const templateFile = path.resolve(path.join(cosi.reg_dir, `template-dashboard-cassandranode-${this.instance}.json`));
        const template = require(templateFile); // eslint-disable-line global-require
        const dash = template.config;

        const width = dash.grid_layout.width;
        let height = dash.grid_layout.height;
        let widget_id = dash.widgets.length + 1;
        let graphs_added = 0;
        const cf_graphs = [];

        for (const columnFamily in metrics.cassandra_cfstats) { // eslint-disable-line guard-for-in
            const matches = columnFamily.match(/^([^`]+)`read_count/);

            if (matches === null) {
                continue;
            }

            cf_graphs.push(matches[1]);
        }

        // add non-system cfs first
        for (const cf of cf_graphs) {
            if (cf.indexOf('system') !== -1) {
                continue;
            }

            console.log(`\tAdding graph ${cf}`);

            dash.widgets.push({
                width,
                name : 'Graph',
                active : true,
                origin : `a${height}`,
                height : 1,
                settings : {
                    hide_yaxis: false,
                    graph_id: null,
                    show_flags: true,
                    _graph_title: `{{=cosi.host_name}} {{=cosi.dashboard_instance}} ${cf}`,
                    key_inline: false,
                    period: 2000,
                    key_size: 1,
                    overlay_set_id: '',
                    account_id: cosi.account_id,
                    date_window: '2h',
                    key_wrap: false,
                    hide_xaxis: false,
                    label: `{{=cosi.dashboard_instance}} ${cf}`,
                    key_loc: 'noop',
                    realtime: false
                },
                tags: [ `cassandra:cfstats:${cf}` ],
                type: 'graph',
                widget_id: `w${widget_id}`
            });

            widget_id += 1;
            graphs_added += 1;
            height += 1;
        }

        // add system cfs after non-system cfs
        for (const cf of cf_graphs) {
            if (cf.indexOf('system') === -1) {
                continue;
            }

            console.log(`\tAdding graph ${cf}`);

            dash.widgets.push({
                width,
                name : 'Graph',
                active : true,
                origin : `a${height}`,
                height : 1,
                settings : {
                    hide_yaxis: false,
                    graph_id: null,
                    show_flags: true,
                    _graph_title: `{{=cosi.host_name}} {{=cosi.dashboard_instance}} ${cf}`,
                    key_inline: false,
                    period: 2000,
                    key_size: 1,
                    overlay_set_id: '',
                    account_id: cosi.account_id,
                    date_window: '2h',
                    key_wrap: false,
                    hide_xaxis: false,
                    label: `{{=cosi.dashboard_instance}} ${cf}`,
                    key_loc: 'noop',
                    realtime: false
                },
                tags: [ `cassandra:cfstats:${cf}` ],
                type: 'graph',
                widget_id: `w${widget_id}`
            });

            widget_id += 1;
            graphs_added += 1;
            height += 1;
        }

        dash.grid_layout.height = height;

        try {
            fs.writeFileSync(templateFile, JSON.stringify(template, null, 4), { encoding: 'utf8', mode: 0o644, flag: 'w' });
        } catch (err) {
            cb(err);
            return;
        }

        cb(null, graphs_added, templateFile);
    }


    preConfigDashboard() {
        const metaErr = this._create_meta_conf();

        if (metaErr !== null) {
            this.emit('preconfig.done', metaErr);
            return;
        }
        console.log(chalk.green(`\tSaved`), 'meta configuration');

        //  ask NAD for the current metrics so we can alter the node and cluster templates
        //  to leave space for column family graphs at the bottom

        const self = this;

        this._loadMetrics((loadErr, metrics) => {
            if (loadErr !== null) {
                self.emit('preconfig.done', loadErr);
                return;
            }
            console.log(chalk.green('\tMetrics loaded'));

            self._createMetricTags(metrics, (tagErr, tagFile) => {
                if (tagErr !== null) {
                    self.emit('preconfig.done', tagErr);
                    return;
                }
                console.log(chalk.green('\tSaved'), `metric tags ${tagFile}`);

                self._addCFGraphs(metrics, (graphErr, added, templateFile) => {
                    if (graphErr !== null) {
                        self.emit('preconfig.done', graphErr);
                        return;
                    }
                    console.log(chalk.green('\tAdded'), `${added} graph(s) to template`);
                    console.log(chalk.green('\tSaved'), `template ${templateFile}`);

                    self.emit('preconfig.done', null);
                });
            });
        });
    }

    _test_nodetool() {
        let nt_test_stdout = null;

        try {
            nt_test_stdout = child.execSync('nodetool version');
        } catch (err) {
            return err;
        }

        if (!nt_test_stdout || nt_test_stdout.indexOf('ReleaseVersion') === -1) {
            return new Error("Cannot find 'nodetool' in PATH, cassandra plugin will not work");
        }

        return null;
    }


    _create_meta_conf() {
        const meta = {
            sys_graphs: [],
            vars: { cluster_name: this.globalMetadata.cluster_name }
        };

        // for *GLOBAL* (available to all plugin visuals) meta data add attributes to this.globalMetaData
        // these meta data files are dashboard-specific

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
        // if (this.state.fs_mount && this.state.fs_mount !== '') {
        //     meta.sys_graphs.push({
        //         dashboard_tag: 'database:file_system_space',
        //         metric_group: 'fs',
        //         metric_item: this.state.fs_mount.replace(/[^a-z0-9\-_]/ig, '_'),
        //         graph_instance: null
        //     });
        // }

        let metaFile = null;

        try {
            metaFile = path.resolve(path.join(cosi.reg_dir, `meta-dashboard-cassandranode-${this.instance}.json`));
            fs.writeFileSync(metaFile, JSON.stringify(meta, null, 4), { encoding: 'utf8', mode: 0o644, flag: 'w' });

            metaFile = path.resolve(path.join(cosi.reg_dir, `meta-dashboard-cassandracluster-${this.instance}.json`));
            fs.writeFileSync(metaFile, JSON.stringify(meta, null, 4), { encoding: 'utf8', mode: 0o644, flag: 'w' });
        } catch (err) {
            return err;
        }

        return null;
    }

    _create_observer_conf() {
        const cass_po_conf_file = '/opt/circonus/etc/cass-po-conf.sh';
        const contents = [];

        if (cosi.agent_url !== '') {
            contents.push(`NADURL="${cosi.agent_url}"`);
        }
        // what if agent_url does === ''?

        if (this.iface !== null) {
            contents.push(`IFACE="${this.iface}"`);
        }

        try {
            fs.writeFileSync(cass_po_conf_file, contents.join('\n'), { encoding: 'utf8', mode: 0o644, flag: 'w' });
        } catch (err) {
            return err;
        }

        return null;
    }
}

module.exports = Cassandra;

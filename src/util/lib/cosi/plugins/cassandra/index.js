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

    /* options:
        database    postgres database to use (default: postgres)
        port        postgresql server port (default: 5432)
        user        postgres user (default: postgres)
        pass        postgres pass (default: none)
    */
    constructor(options) {
        super(options);
        this.name = 'cassandra';
        this.instance = "cassandra";
        this.dashboardPrefix = 'cassandra_node';
        this.graphPrefix = [ 'cassandra_', 'cassandra_protocol_observer' ];
        this.regDir = cosi.reg_dir;
    }

    enablePlugin(cb) {
        console.log(chalk.blue(this.marker));
        console.log("Enabling agent plugin for Cassandra database");

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

    fetchTemplates() {
        const self = this;
        const templateID = "dashboard-cassandra_node";
        const fetcher = new TemplateFetcher();

        console.log(`\tFetching templates for ${templateID}`);

        fetcher.template(templateID, (err, template) => {
            if (err !== null) {
                self.emit('error', err);
                return;
            }

            const cfgFile = path.resolve(path.join(cosi.reg_dir, `template-${templateID}.json`));

            template.save(cfgFile, true);
            console.log(chalk.green('\tSaved'), `template ${cfgFile}`);
            const clusterTemplateID = "dashboard-cassandra_cluster";
            console.log(`\tFetching templates for ${clusterTemplateID}`);
            fetcher.template(clusterTemplateID, (err, template) => {
                if (err !== null) {
                    self.emit('error', err);
                    return;
                }

                const cfgFile = path.resolve(path.join(cosi.reg_dir, `template-${clusterTemplateID}.json`));

                template.save(cfgFile, true);
                console.log(chalk.green('\tSaved'), `template ${cfgFile}`);
                self.emit('fetch.done');
            });
        });
    }


    activatePluginScripts(cb) {
        console.log('\tActivating Cassandra plugin scripts');

        const self = this;

        // enable the cassandra plugin scripts and attempt to start protocol observer if applicable
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

            console.log(chalk.green('\tEnabled'), 'agent plugin for Cassandra');

            cb(null);
            return;
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

        const types = ["Query", "Execute", "Prepare"];
        const seps = ["`"];
        const atts = ["latency", "request_bytes", "response_bytes"];

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


    preConfigDashboard() {
        const self = this;
        const err = this._create_meta_conf();

        if (err === null) {
            console.log(chalk.green(`\tSaved`), 'meta configuration');

            /* ask NAD for the current metrics so we can alter the node and cluster templates 
               to leave space for column family graphs at the bottom */
            
            const metricTagsFile = path.resolve(self.regDir, "metric-tags.json");

            const metricsLoader = new Metrics(cosi.agent_url);

            metricsLoader.getMetrics((err, metrics) => {
                if (err) {
                    self.emit('error', err);
                    return;
                }
                console.log(chalk.green('Metrics loaded'));

                let metric_tags = {};
                if (fs.existsSync(metricTagsFile)) {
                    metric_tags = require(metricTagsFile);
                }

                // for (const metric of metrics) {
                let metricGroups = Object.keys(metrics);
                for (let i = 0; i < metricGroups; i++) {
                    let mg = metricGroups[i];
                    let metricNames = Object.keys(metrics[mg]);
                    for (let j = 0; j < metricNames.length; j++) {
                        let mt = metric_tags[mg + "`" + metricNames[j]];
                        if (mt === undefined) {
                            mt = [];
                        }
                        mt.push("cluster:" + self.state.cluster_name);
                        metric_tags[mg + "`" + metricNames[j]] = mt;
                    }
                }

                fs.writeFileSync(
                    metricTagsFile,
                    JSON.stringify(metric_tags),
                    { encoding: "utf8", mode: 0o644, flag: "w" }
                );

                const templateFile = path.resolve(self.regDir, "template-dashboard-cassandra_node.json");
                let template = require(templateFile);
                let dash = template.config;

                let height = dash.grid_layout.height;
                const width = dash.grid_layout.width;
                let cfstats = Object.keys(metrics["cassandra_cfstats"]);
                for (let i = 0; i < cfstats.length; i++) {
                    let match = cfstats[i].match(/^([^`])`read_count$/);
                    if (match && match.length) {
                        const cf = match[1];
                        const added_graph = {
                            "width" : width,
                            "name" : "Graph",
                            "active" : true,
                            "origin" : "a" + (height - 1),
                            "height" : 1,
                            "settings" : {
                                "hide_yaxis" : false,
                                "graph_id" : null,
                                "show_flags" : true,
                                "_graph_title" : title,
                                "key_inline" : false,
                                "period": 2000,
                                "key_size": 1,
                                "overlay_set_id": "",
                                "account_id": cosi.account_id,
                                "date_window": "2h",
                                "key_wrap": false,
                                "hide_xaxis": false,
                                "label": title,
                                "key_loc": "noop",
                                "realtime": false                            
                            },
                            "tags" : ["cassandra:cfstats:" + cf],
                            "type" : "graph",
                            "widget_id" : "w" + (width * height)
                        };
                        dash.widgets.push(added_graph);
                    }
                }

                dash.grid_layout.height = height;

                fs.writeFileSync(
                    templateFile,
                    JSON.stringify(template),
                    { encoding: "utf8", mode: 0o644, flag: "w" }
                );
            });
            self.emit("preconfig.done", null);
        } else {
            this.emit('preconfig.done', err);
        }
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

    _create_observer_conf() {
        // create protocol observer config
        const cass_po_conf_file = '/opt/circonus/etc/cass-po-conf.sh';
        const contents = [];

        if (cosi.agent_url !== '') {
            contents.push(`NADURL="${cosi.agent_url}"`);
        }

        try {
            fs.writeFileSync(
                cass_po_conf_file,
                contents.join('\n'),
                { encoding: 'utf8', mode: 0o644, flag: 'w' }
            );
        } catch (err) {
            return err;
        }

        return null;
    }
}

module.exports = Cassandra;

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
const TemplateFetcher = require(path.resolve(path.join(cosi.lib_dir, 'template', 'fetch')));
const Metrics = require(path.join(cosi.lib_dir, 'metrics'));

class Cassandra extends Plugin {

    /**
     * create new cassandra plugin object
     * @arg {Object} options for plugin
     *               iface - protocol_observer interface to observe for cassandra traffic
    */
    constructor(options) {
        super(options);

        this.name = 'cassandra';
        this.instance = 'cassandra';
        this.dashboardPrefix = `${this.name}node`;
        this.graphPrefix = [ `${this.name}_`, `${this.name}_protocol_observer` ];
        this.enableClusters = false;
        this.logFile = path.resolve(path.join(cosi.log_dir, `plugin-${this.name}.log`));
        this.cfgFile = path.resolve(path.join(cosi.etc_dir, `plugin-${this.name}.json`));
        this.protocolObserverConf = path.resolve(path.join(cosi.nad_etc_dir, `${this.name}_po_conf.sh`));
        this.iface = options.iface || 'auto';
        this.execEnv = {
            COSI_PLUGIN_CONFIG_FILE : this.cfgFile,
            LOG_FILE                : this.logFile,
            NAD_SCRIPTS_DIR         : path.resolve(path.join(cosi.nad_etc_dir, 'node-agent.d')),
            PLUGIN_SCRIPTS_DIR      : path.resolve(path.join(cosi.nad_etc_dir, 'node-agent.d', this.name))
        };
    }


    /**
     * Overridden base class method to enable the plugin
     * @arg {Function} cb callback called with null or error
     * @returns {Undefined} nothing, uses callback
     */
    enablePlugin(cb) {
        console.log(chalk.blue(this.marker));
        console.log('Enabling agent plugin for Cassandra database');

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

        err = this._test_nodetool();
        if (err === null) {
            console.log(chalk.green('\tPassed'), 'nodetool test');
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
        console.log(chalk.blue(this.marker));
        console.log(`Disabling agent plugin for Cassandra`);

        const script = path.resolve(path.join(__dirname, 'nad-disable.sh'));
        const options = { env: this.execEnv };
        const self = this;

        child.exec(script, options, (error, stdout, stderr) => { // eslint-disable-line no-unused-vars
            if (error !== null) {
                cb(new Error(`${stderr} (exit code ${error.code})`));

                return;
            }

            try {
                fs.unlinkSync(self.protocolObserverConf);
                console.log(`\tRemoved config file: ${self.protocolObserverConf}`);
            } catch (unlinkErr) {
                console.log(chalk.yellow('\tWARN'), 'ignoring...', unlinkErr.toString());
            }

            console.log(chalk.green('\tDisabled'), 'agent plugin for Cassandra');

            cb(null);
        });
    }


    // support methods


    /**
     * Overridden base class method to fetch plugin template(s), the cassandra plugin supports more than one template.
     * @returns {Undefined} nothing, emits event
     */
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


    /**
     * called by enable plugin to activate the individual plugin scripts
     * @arg {Function} cb callback called with null or error
     * @returns {Undefined} nothing, uses callback
     */
    activatePluginScripts(cb) {
        console.log(`\tActivating Cassandra plugin scripts - this may take a few minutes... (log: ${this.logFile})`);

        const self = this;

        // enable the cassandra plugin scripts and attempt to start protocol observer if applicable
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

            console.log(chalk.green('\tEnabled'), 'agent plugin for Cassandra');

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
            });
        });

        req.write(JSON.stringify(po));
        req.end();
    }


    /**
     * load other nad metrics
     * @arg {Function} cb callback called with null or error
     * @returns {Undefined} nothing, uses callback
     */
    _loadMetrics(cb) { // eslint-disable-line class-methods-use-this
        const metricsLoader = new Metrics(cosi.agent_url);

        metricsLoader.getMetrics((err, metrics) => {
            if (err) {
                cb(err);

                return;
            }
            cb(null, metrics);
        });
    }


    /**
     * create tags for specific plugin metrics (for finding visuals during registartion)
     * @arg {Object} metrics to tag
     * @arg {Function} cb callback called with null or error
     * @returns {Undefined} nothing, uses callback
     */
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
            fs.writeFileSync(metricTagsFile, JSON.stringify(metric_tags, null, 4), {
                encoding : 'utf8',
                flag     : 'w',
                mode     : 0o644
            });
        } catch (err) {
            cb(err);

            return;
        }

        cb(null, metricTagsFile);
    }


    /**
     * add column family graphs
     * @arg {Object} metrics to use
     * @arg {Function} cb callback
     * @returns {Undefined} nothing, uses callback
     */
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
                active   : true,
                height   : 1,
                name     : 'Graph',
                origin   : `a${height}`,
                settings : {
                    _graph_title   : `{{=cosi.host_name}} {{=cosi.dashboard_instance}} ${cf}`,
                    account_id     : cosi.account_id,
                    date_window    : '2h',
                    graph_id       : null,
                    hide_xaxis     : false,
                    hide_yaxis     : false,
                    key_inline     : false,
                    key_loc        : 'noop',
                    key_size       : 1,
                    key_wrap       : false,
                    label          : `{{=cosi.dashboard_instance}} ${cf}`,
                    overlay_set_id : '',
                    period         : 2000,
                    realtime       : false,
                    show_flags     : true
                },
                tags      : [ `cassandra:cfstats:${cf}` ],
                type      : 'graph',
                widget_id : `w${widget_id}`,
                width
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
                active   : true,
                height   : 1,
                name     : 'Graph',
                origin   : `a${height}`,
                settings : {
                    _graph_title   : `{{=cosi.host_name}} {{=cosi.dashboard_instance}} ${cf}`,
                    account_id     : cosi.account_id,
                    date_window    : '2h',
                    graph_id       : null,
                    hide_xaxis     : false,
                    hide_yaxis     : false,
                    key_inline     : false,
                    key_loc        : 'noop',
                    key_size       : 1,
                    key_wrap       : false,
                    label          : `{{=cosi.dashboard_instance}} ${cf}`,
                    overlay_set_id : '',
                    period         : 2000,
                    realtime       : false,
                    show_flags     : true
                },
                tags      : [ `cassandra:cfstats:${cf}` ],
                type      : 'graph',
                widget_id : `w${widget_id}`,
                width
            });

            widget_id += 1;
            graphs_added += 1;
            height += 1;
        }

        dash.grid_layout.height = height;

        try {
            fs.writeFileSync(templateFile, JSON.stringify(template, null, 4), {
                encoding : 'utf8',
                flag     : 'w',
                mode     : 0o644
            });
        } catch (err) {
            cb(err);

            return;
        }

        cb(null, graphs_added, templateFile);
    }


    /**
     * pre-configures dashboard template(s) so that the registration run will succeed
     * @returns {Undefined} nothing, emits event
     */
    preConfigDashboard() {
        const metaErr = this._createMetaConf();

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

    /**
     * verify the cassandra `nodetool` command functions as configured
     * @returns {Undefined} null if ok, or exits if not found
     */
    _test_nodetool() { // eslint-disable-line class-methods-use-this
        let nt_test_stdout = null;

        try {
            nt_test_stdout = child.execSync('nodetool version');
        } catch (err) {
            return new Error(err.toString());
        }

        if (!nt_test_stdout || nt_test_stdout.indexOf('ReleaseVersion') === -1) {
            return new Error("Cannot find 'nodetool' in PATH, cassandra plugin will not work");
        }

        return null;
    }


    /**
     * create meta data config to use during registration of plugin visuals
     * @returns {Object} error or null
     */
    _createMetaConf() {
        const meta = {
            sys_graphs : [],
            vars       : { cluster_name: this.globalMetadata.cluster_name }
        };

        // for *GLOBAL* meta data (available to all plugin visuals), add attributes to
        // this.globalMetaData. the meta data file(s) created here are dashboard-specific

        /*
            using sys_graphs mapping: (sadly, it ties the code to the dashboard template atm)
                dashboard_tag - the tag from the widget in the dashboard template
                metric_group - the system metrics group (e.g. fs, vm, cpu, etc.)
                metric_item - the specific graph item, for a variable graph, or null
                graph_instance - the graph instance (some graph templates produce mulitple graphs) # or 0|null default: null

            example:
                dashboard_tag: 'database:file_system_space'
                metric_group: 'fs'
                metric_item: '/'
                graph_instance: null

            would result in the graph from 'registration-graph-fs-0-_.json' being used for
            the widget which has the tag 'database:file_system_space' on the dashboard
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

        // node dashboard meta data
        try {
            metaFile = path.resolve(path.join(cosi.reg_dir, `meta-dashboard-cassandranode-${this.instance}.json`));
            fs.writeFileSync(metaFile, JSON.stringify(meta, null, 4), {
                encoding : 'utf8',
                flag     : 'w',
                mode     : 0o644
            });
        } catch (err) {
            return err;
        }

        // cluster dashboard meta data
        try {
            metaFile = path.resolve(path.join(cosi.reg_dir, `meta-dashboard-cassandracluster-${this.instance}.json`));
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

        state.cluster_name = state.cluster_name.trim();
        console.log('\tAdding cluster_name to global meta data');
        this.globalMetadata.cluster_name = state.cluster_name;
        console.log('\tAdding cluster_tag to global meta data');
        this.globalMetadata.cluster_tag = `cluster:${state.cluster_name}`.toLowerCase();

        this.state = state;

        return null;
    }

}

module.exports = Cassandra;

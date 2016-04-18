"use strict";

/*eslint-env node, es6 */
/*eslint-disable no-magic-numbers, global-require */

//
// attributes of objects destined to be json config files
// are not camelcase...
//
/*eslint camelcase: [2, {properties: "never"}]*/

const assert = require("assert");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const chalk = require("chalk");
const dot = require("dot");

const cosi = require(path.resolve(path.resolve(__dirname, "..", "..", "..", "cosi")));
const Registration = require(path.resolve(cosi.lib_dir, "registration"));
const Template = require(path.join(cosi.lib_dir, "template"));
const templateList = require(path.join(cosi.lib_dir, "template", "list"));

class Config extends Registration {


    constructor(quiet) {
        super(quiet);

        this.regConfig = null;
        this.metrics = null;
        this.templateList = null;

        dot.templateSettings.varname = "cosi";

    }


    config() {
        console.log(chalk.bold("\nRegistration configuration"));

        const self = this;

        this.once("metrics.load", this.loadMetrics);
        this.once("metrics.load.done", () => {
            self.emit("templates.find");
        });

        this.once("templates.find", this.findTemplates);
        this.once("templates.find.done", () => {
            self.emit("graphs.config");
        });

        this.once("graphs.config", this.configGraphs);
        this.once("graphs.config.done", () => {
            self.emit("check.config");
        });

        this.once("check.config", this.configSystemCheck);
        this.once("check.config.done", () => {
            self.emit("statsd.config");
        });

        this.once("statsd.config", this.configStatsdCheck);
        this.once("statsd.config.done", () => {
            self.emit("worksheet.config");
        });

        this.once("worksheet.config", this.configWorksheet);
        this.once("worksheet.config.done", () => {
            self.emit("config.done");
        });

        this.loadRegConfig();
        this.emit("metrics.load");
    }


    loadRegConfig() {
        console.log(chalk.blue(this.marker));
        console.log("Loading registration configuration");

        try {
            this.regConfig = require(this.regConfigFile);
        }
        catch (err) {
            this.emit("error", err);
            return;
        }

        console.log(chalk.green("Registration configuration loaded"), this.regConfigFile);
        this.emit("regconf.load.done");
    }


    loadMetrics() {
        console.log(chalk.blue(this.marker));
        console.log("Loading available metrics");

        const metricsFile = path.resolve(this.regConfig.metricsFile);

        try {
            this.metrics = require(metricsFile);
        }
        catch (err) {
            this.emit("error", err);
            return;
        }

        console.log(chalk.green("Metrics loaded"), metricsFile);
        this.emit("metrics.load.done");

    }


    findTemplates() {
        console.log(chalk.blue(this.marker));
        console.log("Identifying check and graph templates");

        const self = this;

        templateList(this.regDir, (listError, templates) => {
            if (listError) {
                self.emit("error", listError);
                return;
            }

            self.templateList = {};

            // for (const template of templates) {
            for (let i = 0; i < templates.length; i++) {
                const template = templates[i];
                const templateType = template.config.type;
                const templateId = template.config.id;

                console.log(`\tFound ${templateType}-${templateId} ${template.file}`);
                if (!self.templateList.hasOwnProperty(templateType)) {
                    self.templateList[templateType] = [];
                }

                if (templateType === "graph") {
                    if (self.metrics.hasOwnProperty(templateId)) {
                        self.templateList[templateType].push(templateId);
                    }
                    else {
                        console.log(`\t${chalk.yellow("Skipping")} ${templateType}-${templateId}, no metrics found for '${templateId}'.`);
                    }
                }
                else {
                    self.templateList[templateType].push(templateId);
                }
            }

            self.emit("templates.find.done");

        });
    }


    configGraphs() {
        console.log(chalk.blue(this.marker));

        const self = this;
        const graphs = self.templateList.graph;

        this.on("config.graph", this.configGraph);

        this.on("config.graph.next", () => {
            const graphId = graphs.shift();

            if (typeof graphId === "undefined") {
                self.removeAllListeners("config.graph");
                self.removeAllListeners("config.graph.next");
                self.emit("graphs.config.done");
            }
            else {
                self.emit("config.graph", graphId);
            }
        });

        this.emit("config.graph.next");
    }


    configGraph(graphId) {
        assert.equal(typeof graphId, "string", "graphId is required");

        const templateFile = path.resolve(this.regDir, `template-graph-${graphId}.json`);
        const template = new Template(templateFile);

        console.log(`Preconfiguring graphs for ${graphId}`);
        console.log(`\tUsing template ${templateFile}`);

        for (let graphIdx = 0; graphIdx < template.graphs.length; graphIdx++) {
            if (template.variable_metrics) {
                this.configVariableGraph(template, graphIdx);
            }
            else {
                this.configStaticGraph(template, graphIdx);
            }
        }

        this.emit("config.graph.next");
    }


    configVariableGraph(template, graphIdx) {
        assert.equal(typeof template, "object", "template is required");
        assert.equal(typeof graphIdx, "number", "graphIdx is required");

        // get list of variable metric items required for graph with mapping
        // to actual metric name and graph datapoint offset
        const variableMetricList = this._getVariableMetrics(template, graphIdx);

        // create one graph for each distinct variable metric pattern matched (item)
        for (const item in variableMetricList) { //eslint-disable-line guard-for-in
            const configFile = path.resolve(
                this.regDir,
                `config-graph-${template.id}-${graphIdx}-${item.replace(/[^a-z0-9\-\_]/ig, "_")}.json`
            );

            if (this._fileExists(configFile)) {
                console.log("\tGraph config already exists.", configFile);
            }
            else {
                const graphId = `${template.type}-${template.id}-${item}`;
                const graph = JSON.parse(JSON.stringify(template.graphs[graphIdx]));
                // const graph = Object.assign({}, template.graphs[graphIdx]);

                console.log(`\tCreating pre-config graph ${graphIdx} for ${template.id}.${item}`);

                // for (const metric of variableMetricList[item]) {
                for (let i = 0; i < variableMetricList[item].length; i++) {
                    const metric = variableMetricList[item][i];

                    graph.datapoints[metric.datapointIndex].metric_name = metric.name;
                }

                graph.notes = this.regConfig.cosiNotes;

                this._setTags(graph, graphId);
                this._setCustomGraphOptions(graph, graphId);

                const preConfigFile = configFile.replace(".json", ".pre.json");

                try {
                    fs.writeFileSync(
                        preConfigFile,
                        JSON.stringify(graph, null, 4),
                        { encoding: "utf8", mode: 0o644, flag: "w" }
                    );
                }
                catch (err) {
                    this.emit("error", err);
                    return;
                }

                console.log(chalk.green("\tSaved pre-config"), preConfigFile);
            }
        }
    }


    configStaticGraph(template, graphIdx) {
        assert.equal(typeof template, "object", "template is required");
        assert.equal(typeof graphIdx, "number", "graphIdx is required");

        const configFile = path.resolve(this.regDir, `config-graph-${template.id}-${graphIdx}.json`);

        if (this._fileExists(configFile)) {
            console.log("\tGraph config already exists.", configFile);
            return;
        }

        // const graph = Object.assign({}, template.graphs[graphIdx]);
        const graph = JSON.parse(JSON.stringify(template.graphs[graphIdx]));

        console.log(`\tCreating pre-config graph ${graphIdx} for ${template.id}`);

        graph.notes = this.regConfig.cosiNotes;

        const graphId = `${template.type}-${template.id}`;

        this._setTags(graph, graphId);
        this._setCustomGraphOptions(graph, graphId);

        const preConfigFile = configFile.replace(".json", ".pre.json");

        try {
            fs.writeFileSync(preConfigFile, JSON.stringify(graph, null, 4), { encoding: "utf8", mode: 0o644, flag: "w" });
        }
        catch (err) {
            this.emit("error", err);
            return;
        }

        console.log(chalk.green("\tSaved pre-config"), preConfigFile);

    }


    configSystemCheck() {
        const id = "check-system";

        console.log(chalk.blue(this.marker));
        console.log(`Configuring Check (${id})`);

        const configFile = path.resolve(this.regDir, `config-${id}.json`);
        const templateFile = configFile.replace("config-", "template-");

        if (this._fileExists(configFile)) {
            console.log("\Check config already exists.", configFile);
            this.emit("check.config.done");
            return;
        }

        const checkMetrics = this._extractMetricsFromGraphConfigs();
        const template = new Template(templateFile);
        const check = template.check;

        // set check type (check module) and type specific config options
        const agentMode = this.agentMode.toLowerCase();

        if ( agentMode === "pull") {
            check.type = "json:nad";
            check.config.url = this.agentUrl;
        }
        else if (agentMode === "push") {
            check.type = "httptrap";
            check.config = {
                asynch_metrics: true,
                secret: crypto.randomBytes(2048).toString("hex").substr(0, 16)
            };
        }
        else {
            this.emit("error", new Error(`Invalid agent mode '${agentMode}'`));
            return;
        }

        // set the broker receiving for pulling metrics
        check.brokers = [
            this.regConfig.broker._cid.replace("/broker/", "")
        ];

        // add the activated metrics
        check.metrics = checkMetrics;

        // set the notes with cosi signature
        check.notes = this.regConfig.cosiNotes;

        this._setTags(check, id);
        this._setCustomCheckOptions(check, id);

        // save the configuration
        try {
            fs.writeFileSync(
                configFile,
                JSON.stringify(check, null, 4),
                { encoding: "utf8", mode: 0o644, flag: "w" }
            );
        }
        catch (err) {
            this.emit("error", err);
            return;
        }

        console.log(chalk.green("Saved config"), configFile);
        this.emit("check.config.done");

    }


    configStatsdCheck() {
        const id = "check-statsd";

        console.log(chalk.blue(this.marker));
        console.log(`Configuring Check (${id})`);

        if (!this.statsd || this.statsd === "none") {
            console.log("Optional StatsD check not enabled, skipping.");
            this.emit("statsd.config.done");
            return;
        }

        const configFile = path.resolve(this.regDir, `config-${id}.json`);
        const templateFile = configFile.replace("config-", "template-");

        if (this._fileExists(configFile)) {
            console.log("\Check config already exists.", configFile);
            this.emit("statsd.config.done");
            return;
        }

        const template = new Template(templateFile);
        const check = template.check;

        const statsdMode = this.statsd.toLowerCase();

        if (statsdMode === "host") {
            check.type = "httptrap";
            check.config = {
                asynch_metrics: true,
                secret: crypto.randomBytes(2048).toString("hex").substr(0, 16)
            };
        }

        if (statsdMode === "broker") {
            if (this._brokerHasStatsd) {
                console.log(chalk.green("Verfiied Broker support for StatsD"));
                check.type = "statsd";
                // save STATSD_HOST and STATSD_PORT to /opt/circonus/etc/shstatsd (when check created successfully)
            }
        }

        // set the broker receiving for pulling metrics
        check.brokers = [
            this.regConfig.broker._cid.replace("/broker/", "")
        ];

        // add the default statsd metrics (don't know what any others will be...)
        check.metrics = [
            {
                name: "statsd`num_stats",
                type: "numeric",
                status: "active"
            }
        ];

        // set the notes with cosi signature
        check.notes = this.regConfig.cosiNotes;

        this._setTags(check, id);
        this._setCustomCheckOptions(check, id);

        // save the configuration
        try {
            fs.writeFileSync(
                configFile,
                JSON.stringify(check, null, 4),
                { encoding: "utf8", mode: 0o644, flag: "w" }
            );
        }
        catch (err) {
            this.emit("error", err);
            return;
        }

        console.log(chalk.green("Saved config"), configFile);
        this.emit("statsd.config.done");

    }


    configWorksheet() {
        const id = "worksheet-system";

        console.log(chalk.blue(this.marker));
        console.log(`Configuring Worksheet (${id})`);

        const configFile = path.resolve(this.regDir, `config-${id}.json`);
        const templateFile = configFile.replace("config-", "template-");

        if (this._fileExists(configFile)) {
            console.log("Config already exists", configFile);
            this.emit("worksheet.config.done");
            return;
        }

        const template = new Template(templateFile);
        const config = template.config;

        config.smart_queries = [
            {
                name: "Circonus One Step Install",
                order: [],
                query: `(notes:"${this.regConfig.cosiNotes}*")`
            }
        ];

        config.notes = this.regConfig.cosiNotes;
        this._setTags(config, id);
        this._setCustomWorksheetOptions(config, id);

        try {
            fs.writeFileSync(
                configFile,
                JSON.stringify(config, null, 4),
                { encoding: "utf8", mode: 0o644, flag: "w" }
            );
        }
        catch (err) {
            this.emit("error", err);
            return;
        }

        console.log("Worksheet configuration saved", configFile);
        this.emit("worksheet.config.done");

    }


    _brokerHasStatsd() {
        if (!this.regConfig.hasOwnProperty("broker")) {
            console.log(chalk.yellow("WARN"), "registration configuration missing broker property, unable to verify support for statsd.");
            return false;
        }

        if (!this.regConfig.broker.hasOwnProperty("_details") && Array.isArray(this.regConfig.broker._details)) {
            console.log(chalk.yellow("WARN"), "registration configuration missing broker details property, unable to verify support for statsd.");
            return false;
        }

        if (!this.regConfig.broker._details[0].hasOwnProperty("modules") && Array.isArray(this.regConfig.broker._details[0].modules)) {
            console.log(chalk.yellow("WARN"), "registration configuration missing broker modules property, unable to verify support for statsd.");
            return false;
        }

        // for (const checkModule of this.regConfig.broker._details.modules) {
        for (let i = 0; i < this.regConfig.broker._details.modules.length; i++) {
            const checkModule = this.regConfig.broker._details.modules[i];

            if (checkModule === "statsd") {
                return true;
            }
        }

        return false;
    }


    _extractMetricsFromGraphConfigs() {
        const checkMetrics = [];

        // step through and load each "config-graph-.+\.json(\.pre)?"
        // yank out all metrics from ech graph (datapoints)
        console.log("Activating metrics required by graphs");

        const files = fs.readdirSync(this.regDir);

        // for (const file of files) {
        for (let fileIdx = 0; fileIdx < files.length; fileIdx++) {
            const file = files[fileIdx];

            if (file.match(/^config-graph-.+(\.pre)?\.json?$/)) {
                try {
                    const configFile = path.resolve(this.regDir, file);

                    console.log(`\tLoading required metrics from ${configFile}`);

                    const graph = require(configFile);

                    // for (const dp of graph.datapoints) {
                    for (let dpIdx = 0; dpIdx < graph.datapoints.length; dpIdx++) {
                        const dp = graph.datapoints[dpIdx];

                        console.log("\tAdding required metric:", dp.metric_name);
                        checkMetrics.push({
                            name: dp.metric_name,
                            type: dp.metric_type,
                            status: "active"
                        });
                    }
                }
                catch (err) {
                    this.emit("error", err);
                }
            }
        }

        return checkMetrics;
    }


    _getVariableMetrics(template, graphIdx) {
        assert.equal(typeof template, "object", "template is required");
        assert.equal(typeof graphIdx, "number", "graphIdx is required");

        // flat list of full metric names metric_group`metric_name (fs`/sys/fs/cgroup`df_used_percent)
        const metrics = Object.keys(this.metrics[template.id]).map((val) => {
            return `${template.id}\`${val}`;
        });

        const variableMetrics = {};

        // cherry pick metrics actually needed
        for (let dpIdx = 0; dpIdx < template.graphs[graphIdx].datapoints.length; dpIdx++) {
            const dp = template.graphs[graphIdx].datapoints[dpIdx];             // "metric_name": "fs`([^`]+)`df_used_percent"

            // for (const metric of metrics) {
            for (let metricIdx = 0; metricIdx < metrics.length; metricIdx++) {
                const metric = metrics[metricIdx];
                const parts = metric.match(dp.metric_name);                     // 'fs`/sys/fs/cgroup`df_used_percent'.match(/fs`([^`]+)`df_used_percent/)

                if (parts) {
                    const item = parts[1];                                      // eg /sys/fs/cgroup
                    let keepMetric = true;                                      // default, keep all metrics

                    if (template.filter) {                                      // apply filters, if configured in template
                        if (template.filter.include && Array.isArray(template.filter.include)) {
                            keepMetric = false;
                            // for (const filter of template.filter.include) {
                            for (let filterIdx = 0; filterIdx < template.filter.include.length; filterIdx++) {
                                const filter = template.filter.include[filterIdx];

                                if (item === filter) {
                                    keepMetric = true;
                                    break;
                                }
                            }
                        }

                        if (keepMetric && template.filter.exclude && Array.isArray(template.filter.exclude)) {
                            // for (const filter of template.filter.exclude) {
                            for (let filterIdx = 0; filterIdx < template.filter.exclude.length; filterIdx++) {
                                const filter = template.filter.exclude[filterIdx];

                                if (item === filter) {
                                    keepMetric = false;
                                    break;
                                }
                            }
                        }
                    }

                    if (keepMetric) {
                        if (!variableMetrics[item]) {
                            variableMetrics[item] = [];
                        }
                        variableMetrics[item].push({
                            name: metric,
                            datapointIndex: `${dpIdx}`
                        });
                    }
                }
            }
        }

        return variableMetrics;
    }


    /*eslint-disable no-param-reassign */
    _setCustomGraphOptions(cfg, id) {
        assert.equal(typeof cfg, "object", "cfg is required");
        assert.equal(typeof id, "string", "id is required");

        console.log("\tApplying custom config options and interpolating templates");

        const idParts = id.split("-", 3);
        const options = [
            "title",
            "description"
        ];

        if (idParts.length >= 2) {
            const cfgType = idParts[0];
            const cfgId = idParts[1];
            const cfgItem = idParts.length === 3 ? idParts[2] : null;

            if (this.customOptions.hasOwnProperty(cfgType)) {
                const custom = this.customOptions[cfgType];

                // for (const opt of options) {
                for (let i = 0; i < options.length; i++) {
                    const opt = options[i];

                    if (custom.hasOwnProperty(opt)) {
                        console.log(`\tSetting ${opt} to ${custom[opt]}`);
                        cfg[opt] = custom[opt];
                    }
                }

                if (custom.hasOwnProperty(cfgId)) {
                    for (let i = 0; i < options.length; i++) {
                        const opt = options[i];

                        if (custom[cfgId].hasOwnProperty(opt)) {
                            console.log(`\tSetting ${opt} to ${custom[cfgId][opt]}`);
                            cfg[opt] = custom[cfgId][opt];
                        }
                    }

                    if (custom[cfgId].hasOwnProperty(cfgItem)) {
                        for (let i = 0; i < options.length; i++) {
                            const opt = options[i];

                            if (custom[cfgId][cfgItem].hasOwnProperty(opt)) {
                                console.log(`\tSetting ${opt} to ${custom[cfgId][cfgItem][opt]}`);
                                cfg[opt] = custom[cfgId][cfgItem][opt];
                            }
                        }
                    }
                }
            }
        }

        const data = this._mergeData(id);

        for (let i = 0; i < options.length; i++) {
            const opt = options[i];

            console.log(`\tInterpolating ${opt} ${cfg[opt]}`);
            cfg[opt] = this._expand(cfg[opt], data);
        }

        // set guide for graph-load template (uses #cpus)
        if (id === "graph-load" && cfg.guides.length > 0) {
            for (let i = 0; i < cfg.guides.length; i++) {
                if (cfg.guides[i].data_formula.indexOf("{{") !== -1) {
                    console.log(`\tInterpolating data_formula ${cfg.guides[i].data_formula} of ${cfg.guides[i].name} guide`);
                    cfg.guides[i].data_formula = this._expand(cfg.guides[i].data_formula, data);
                }
            }
        }
    }
    /*eslint-enable no-param-reassign */


    /*eslint-disable no-param-reassign */
    _setCustomCheckOptions(cfg, id) {
        assert.equal(typeof cfg, "object", "cfg is required");
        assert.equal(typeof id, "string", "id is required");

        console.log("\tApplying custom config options and interpolating templates");

        const idParts = id.split("-", 2);
        const options = [
            "metric_limit",
            "display_name",
            "target"
        ];

        if (idParts.length === 2) {
            const cfgType = idParts[0];
            const cfgId = idParts[1];

            if (this.customOptions.hasOwnProperty(cfgType)) {
                const custom = this.customOptions[cfgType];

                for (let i = 0; i < options.length; i++) {
                    const opt = options[i];

                    if (custom.hasOwnProperty(opt)) {
                        console.log(`\tSetting ${opt} to ${custom[opt]}`);
                        cfg[opt] = custom[opt];
                    }
                }

                if (custom.hasOwnProperty(cfgId)) {
                    for (let i = 0; i < options.length; i++) {
                        const opt = options[i];

                        if (custom[cfgId].hasOwnProperty(opt)) {
                            console.log(`\tSetting ${opt} to ${custom[cfgId][opt]}`);
                            cfg[opt] = custom[cfgId][opt];
                        }
                    }
                }
            }
        }

        const data = this._mergeData(id);

        for (let i = 0; i < options.length; i++) {
            const opt = options[i];

            if (opt !== "metric_limit") {
                console.log(`\tInterpolating ${opt} ${cfg[opt]}`);
                cfg[opt] = this._expand(cfg[opt], data);
            }
        }
    }
    /*eslint-enable no-param-reassign */


    /*eslint-disable no-param-reassign */
    _setCustomWorksheetOptions(cfg, id) {
        assert.equal(typeof cfg, "object", "cfg is required");
        assert.equal(typeof id, "string", "id is required");

        console.log("\tApplying custom config options and interpolating templates");

        const idParts = id.split("-", 2);
        const options = [
            "description",
            "title"
        ];

        if (idParts.length === 2) {
            const cfgType = idParts[0];
            const cfgId = idParts[1];

            if (this.customOptions.hasOwnProperty(cfgType)) {
                const custom = this.customOptions[cfgType];

                for (let i = 0; i < options.length; i++) {
                    const opt = options[i];

                    if (custom.hasOwnProperty(opt)) {
                        console.log(`\tSetting ${opt} to ${custom[opt]}`);
                        cfg[opt] = custom[opt];
                    }
                }

                if (custom.hasOwnProperty(cfgId)) {
                    for (let i = 0; i < options.length; i++) {
                        const opt = options[i];

                        if (custom[cfgId].hasOwnProperty(opt)) {
                            console.log(`\tSetting ${opt} to ${custom[cfgId][opt]}`);
                            cfg[opt] = custom[cfgId][opt];
                        }
                    }
                }
            }
        }

        const data = this._mergeData(id);

        for (let i = 0; i < options.length; i++) {
            const opt = options[i];

            console.log(`\tInterpolating ${opt} ${cfg[opt]}`);
            cfg[opt] = this._expand(cfg[opt], data);
        }
    }
    /*eslint-enable no-param-reassign */


    /*eslint-disable no-param-reassign */
    _setTags(cfg, id) {
        assert.equal(typeof cfg, "object", "cfg is required");
        assert.equal(typeof id, "string", "id is required");

        cfg.tags = cfg.tags || [];

        function addTags(config, tags) {
            if (!config.tags) {
                return;
            }
            if (!Array.isArray(config.tags)) {
                return;
            }
            if (!Array.isArray(tags)) {
                return;
            }

            // for (const tag of tags) {
            for (let i = 0; i < tags.length; i++) {
                const tag = tags[i];

                config.tags.push(tag);
            }
        }

        addTags(cfg, this.regConfig.cosiTags);
        addTags(cfg, this.regConfig.templateData.host_tags || []);

        const idParts = id.split("-", 3);

        if (idParts.length >= 2) {
            const cfgType = idParts[0];
            const cfgId = idParts[1];
            const cfgItemId = idParts.length > 2 ? idParts[2] : null;

            if (cfgType && this.customOptions[cfgType]) {
                const custom = this.customOptions[cfgType];

                addTags(cfg, custom.tags || []);
                if (cfgId && custom.hasOwnProperty(cfgId)) {
                    addTags(cfg, custom[cfgId].tags || []);
                    if (cfgItemId && custom[cfgId].hasOwnProperty(cfgItemId)) {
                        addTags(cfg, custom[cfgId][cfgItemId].tags || []);
                    }
                }
            }
        }
    }
    /*eslint-enable no-param-reassign */

    _mergeData(id) {
        assert.equal(typeof id, "string", "id is required");

        const idParts = id.split("-", 3);

        const defaults = JSON.parse(JSON.stringify(this.regConfig.templateData));

        const data = {
            host_name: defaults.host_name,
            host_target: defaults.host_target
        };

        function propAdd(target, source) {
            for (const prop in source) {
                if (source.hasOwnProperty(prop)) {
                    target[prop] = source[prop]; //eslint-disable-line no-param-reassign
                }
            }
        }

        // data = Object.assign(data, defaults.host_vars);
        propAdd(data, defaults.host_vars || {});

        if (idParts.length >= 2) {
            const cfgType = idParts[0];
            const cfgId = idParts[1];
            const cfgItemId = idParts.length > 2 ? idParts[2] : null;

            if (cfgType === "graph" && cfgItemId) {
                data.graph_item = cfgItemId;
            }

            if (cfgType && this.customOptions[cfgType]) {
                const custom = this.customOptions[cfgType];

                // data = Object.assign(data, custom.vars || {});
                propAdd(data, custom.vars || {});

                if (cfgId && custom.hasOwnProperty(cfgId)) {
                    //data = Object.assign(data, custom[cfgId].vars || {});
                    propAdd(data, custom[cfgId].vars || {});
                    if (cfgItemId && custom[cfgId].hasOwnProperty(cfgItemId)) {
                        //data = Object.assign(data, custom[cfgId][cfgItemId].vars || {});
                        propAdd(data, custom[cfgId][cfgItemId].vars || {});
                    }
                }
            }
        }

        return data;
    }


    _expand(template, vars) {
        assert.equal(typeof template, "string", "template is required");
        assert.equal(typeof vars, "object", "vars is required");

        const fn = dot.template(template);

        return fn(vars);
    }


}

module.exports = Config;

"use strict";

/*eslint-env node, es6 */
/*eslint-disable no-magic-numbers, global-require */
/*eslint camelcase: [2, {properties: "never"}]*/


const assert = require("assert");
// const Events = require("events");
const fs = require("fs");
const path = require("path");

const chalk = require("chalk");

const cosi = require(path.resolve(path.resolve(__dirname, "..", "..", "..", "cosi")));
const Registration = require(path.resolve(cosi.lib_dir, "registration"));
const Check = require(path.resolve(cosi.lib_dir, "check"));
const Graph = require(path.resolve(cosi.lib_dir, "graph"));
const Worksheet = require(path.resolve(cosi.lib_dir, "worksheet"));

class Register extends Registration {

    constructor(quiet) {
        super(quiet);

        this.regConfig = null;
        this.checkId = null;
        this.checkBundleId = null;
        this.checkSubmissionUrl = null;
    }


    register() {
        console.log(chalk.bold("\nRegistration creating check/graphs/worksheet"));

        const self = this;

        this.once("check", this.systemCheck);
        this.once("check.done", () => {
            if (self.checkId === null) {
                self.emit("error", new Error("check id is null, wtf!?"));
                return;
            }

            if (self.agentMode === "push") {
                const npCfgFile = path.resolve(path.join(self.regDir, "..", "..", "etc", "circonus-nadpush.json"));
                const npConfig = {
                    user: "nobody",
                    group: self.cosiAPI.args.dist.toLowerCase() === "ubuntu" ? "nogroup" : "nobody",
                    agent_url: self.agentUrl,
                    check_url: self.checkSubmissionUrl
                };

                console.log(`\tSaving NAD Push configuration ${npCfgFile}`);

                try {
                    fs.writeFileSync(
                        npCfgFile,
                        JSON.stringify(npConfig, null, 4),
                        { encoding: "utf8", mode: 0o644, flag: "w" }
                    );
                }
                catch (nadpushConfigErr) {
                    self.emit("error", nadpushConfigErr);
                    return;
                }
            }
            else if (self.agentMode === "reverse") {
                const nadCfgFile = path.resolve(path.join(self.regDir, "..", "etc", "circonus-nadreversesh"));
                const nadOpts = [
                    `nadrev_plugin_dir="${path.resolve(path.join(self.regDir, "..", "..", "etc", "node-agent.d"))}"`,
                    "nadrev_listen_address=\"127.0.0.1:2609\"",
                    "nadrev_enable=1",
                    `nadrev_check_id="${self.checkBundleId}"`,
                    `nadrev_key="${self.circonusAPI.key}"`
                ];

                console.log(`\tSaving NAD Reverse configuration ${nadCfgFile}`);

                try {
                    fs.writeFileSync(
                        nadCfgFile,
                        nadOpts.join("\n"),
                        { encoding: "utf8", mode: 0o640, flag: "w" }
                    );
                }
                catch (nadCfgErr) {
                    self.emit("error", nadCfgErr);
                    return;
                }
            }

            self.emit("statsd");
        });

        this.once("statsd", this.statsdCheck);
        this.once("statsd.done", () => {

            self.emit("graphs");
        });

        this.once("graphs", this.graphs);
        this.once("graphs.done", () => {
            self.emit("worksheet");
        });

        this.once("worksheet", this.worksheet);
        this.once("worksheet.done", () => {
            self.emit("registration.done");
        });

        this.loadRegConfig();
        this.emit("check");
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
    }


    systemCheck() {
        console.log(chalk.blue(this.marker));
        console.log("Creating system check");

        const self = this;
        const regFile = path.resolve(this.regDir, "registration-check-system.json");
        const cfgFile = regFile.replace("registration-", "config-");

        if (this._fileExists(regFile)) {
            console.log(chalk.bold("Registration exists"), `using ${regFile}`);

            const check = new Check(regFile);

            this.checkId = check._checks[0].replace("/check/", "");
            self.checkBundleId = check._cid.replace("/check_bundle/", "");
            if (self.agentMode === "push") {
                this.checkSubmissionUrl = check.config.submission_url;
            }
            this.emit("check.done");
            return;
        }

        if (!this._fileExists(cfgFile)) {
            this.emit("error", new Error(`Missing system check configuration file '${cfgFile}'`));
            return;
        }

        const check = new Check(cfgFile);

        if (check.verifyConfig()) {
            console.log("\tValid check config");
        }

        console.log("\tSending check configuration to Circonus API");

        check.create((err) => {
            if (err) {
                self.emit("error", err);
                return;
            }

            console.log(`\tSaving registration ${regFile}`);
            check.save(regFile, true);

            self.checkId = check._checks[0].replace("/check/", "");
            self.checkBundleId = check._cid.replace("/check_bundle/", "");
            if (self.agentMode === "push") {
                this.checkSubmissionUrl = check.config.submission_url;
            }
            console.log(chalk.green("\tCheck created:"), `${self.regConfig.account.uiUrl}${check._checks[0].replace("check", "checks")}`);

            self.emit("check.done");
        });

    }


    statsdCheck() {
        console.log(chalk.blue(this.marker));
        console.log("Creating StatsD check");

        if (!this.statsd || this.statsd === "none") {
            console.log("Optional StatsD check not enabled, skipping.");
            this.emit("statsd.done");
            return;
        }

        const self = this;

        const saveStatsdConfig = (submitUrl) => {
            const statsdCfgFile = `${cosi.etc_dir}/statsd.json`;
            const circonusBackend = "./backends/circonus";

            console.log(`\tCreating StatsD configuration ${statsdCfgFile}`);

            // default configuration
            let statsdConfig = {
                port: 8125,
                address: "127.0.0.1",
                flushInterval: 60000,
                keyNameSanitize: false,
                backends: [ circonusBackend ],
                circonus: {
                    check_url: submitUrl,
                    forceGC: true
                }
            };

            // load an existing configuration, if it exists
            try {
                statsdConfig = require(statsdCfgFile);
            }
            catch (err) {
                if (err.code !== "MODULE_NOT_FOUND") {
                    self.emit("error", err);
                }
            }

            // set check_url
            if (!statsdConfig.hasOwnProperty("circonus")) {
                statsdConfig.circonus = {};
            }
            statsdConfig.circonus.check_url = submitUrl;

            // add circonus backend if it is not already defined
            if (!statsdConfig.hasOwnProperty("backends") || !Array.isArray(statsdConfig.backends)) {
                statsdConfig.backends = [];
            }
            if (statsdConfig.backends.indexOf(circonusBackend) === -1) {
                statsdConfig.backends.push(circonusBackend);
            }

            console.log(`\tSaving StatsD configuration file ${statsdCfgFile}`);
            try {
                fs.writeFileSync(
                    statsdCfgFile,
                    JSON.stringify(statsdConfig, null, 4),
                    { encoding: "utf8", mode: 0o644, flag: "w" }
                );
            }
            catch (statsdConfigErr) {
                self.emit("error", statsdConfigErr);
                return;
            }
        };

        const regFile = path.resolve(this.regDir, "registration-check-statsd.json");
        const cfgFile = regFile.replace("registration-", "config-");

        if (this._fileExists(regFile)) {
            console.log(chalk.bold("Registration exists"), `using ${regFile}`);

            if (this.statsd === "host") {
                const check = new Check(regFile);

                saveStatsdConfig(check.config.submission_url);
            }

            this.emit("statsd.done");
            return;
        }

        if (!this._fileExists(cfgFile)) {
            this.emit("error", new Error(`Missing statsd check configuration file '${cfgFile}'`));
            return;
        }

        const check = new Check(cfgFile);

        if (check.verifyConfig()) {
            console.log("\tValid check config");
        }

        console.log("\tSending check configuration to Circonus API");

        check.create((err) => {
            if (err) {
                self.emit("error", err);
                return;
            }

            console.log(`\tSaving registration ${regFile}`);
            check.save(regFile);

            console.log(chalk.green("\tCheck created:"), `${self.regConfig.account.uiUrl}${check._checks[0].replace("/check/", "/checks/")}`);

            saveStatsdConfig(check.config.submission_url);

            self.emit("statsd.done");
        });
    }


    graphs() {
        const self = this;
        const graphConfigs = [];

        try {
            const files = fs.readdirSync(this.regDir);

            for (let i = 0; i < files.length; i++) {
                const file = files[i];

                if (file.match(/^config-graph-/)) {
                    graphConfigs.push(path.resolve(path.join(this.regDir, file)));
                }
            }
        }
        catch (err) {
            this.emit("error", err);
            return;
        }

        this.on("create.graph", this.graph);

        this.on("create.graph.next", () => {
            const configFile = graphConfigs.shift();

            if (typeof configFile === "undefined") {
                self.removeAllListeners("create.graph");
                self.removeAllListeners("create.graph.next");
                self.emit("graphs.done");
            }
            else {
                self.emit("create.graph", configFile);
            }
        });

        this.emit("create.graph.next");
    }


    graph(configFile) {
        assert.strictEqual(typeof configFile, "string", "configFile is required");

        console.log(chalk.blue(this.marker));
        console.log("Creating graph", configFile);

        let cfgFile = configFile;

        const graph = new Graph(configFile);

        if (graph.isPreConfig()) {
            console.log(`\tUpdating pre-config with check ID ${this.checkId}`);

            cfgFile = configFile.replace(".pre", "");
            graph.preToConfig(this.checkId);

            console.log("\tSaving config", cfgFile);
            try {
                graph.save(cfgFile);
            }
            catch (err) {
                this.emit("error", err);
                return;
            }

            console.log("\tRemoving pre-config", configFile);
            try {
                fs.unlinkSync(configFile);
            }
            catch (err) {
                this.emit("error", err);
                return;
            }
        }

        const regFile = cfgFile.replace("config-", "registration-");

        if (this._fileExists(regFile)) {
            console.log(chalk.bold("Registration exists"), `using ${regFile}`);
            this.emit("create.graph.next");
            return;
        }

        console.log("\tSending graph configuration to Circonus API");
        const self = this;

        graph.create((err) => {
            if (err) {
                self.emit("error", err);
                return;
            }

            console.log(`\tSaving registration ${regFile}`);
            graph.save(regFile);

            console.log(chalk.green("\tGraph created:"), `${self.regConfig.account.uiUrl}/trending/graphs/view/${graph._cid.replace("/graph/", "")}`);
            self.emit("create.graph.next");
        });
    }


    worksheet() {
        console.log(chalk.blue(this.marker));
        console.log("Creating COSI worksheet");

        const self = this;
        const regFile = path.resolve(this.regDir, "registration-worksheet-system.json");
        const cfgFile = regFile.replace("registration-", "config-");

        if (this._fileExists(regFile)) {
            console.log(chalk.bold("Registration exists"), `using ${regFile}`);
            this.emit("worksheet.done");
            return;
        }

        if (!this._fileExists(cfgFile)) {
            this.emit("error", new Error(`Missing worksheet configuration file '${cfgFile}'`));
            return;
        }

        const worksheet = new Worksheet(cfgFile);

        if (worksheet.verifyConfig()) {
            console.log("\tValid worksheet config");
        }

        console.log("\tSending worksheet configuration to Circonus API");

        worksheet.create((err) => {
            if (err) {
                self.emit("error", err);
                return;
            }

            console.log(`\tSaving registration ${regFile}`);
            worksheet.save(regFile, true);

            console.log(chalk.green("\tWorksheet created:"), `${self.regConfig.account.uiUrl}/trending/worksheets/${worksheet._cid.replace("/worksheet/", "")}`);
            self.emit("worksheet.done");
        });

    }

}

module.exports = Register;

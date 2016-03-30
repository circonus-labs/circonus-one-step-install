"use strict";

/*eslint-env node, es6 */
/*eslint-disable no-magic-numbers, global-require, camelcase */

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const url = require("url");

const api = require("circonusapi2");
const chalk = require("chalk");

const cosi = require(path.resolve(path.resolve(__dirname, "..", "..", "..", "cosi")));

const Broker = require(path.join(cosi.lib_dir, "broker"));
const Metrics = require(path.join(cosi.lib_dir, "metrics"));
const Registration = require(path.resolve(cosi.lib_dir, "registration"));
const TemplateFetcher = require(path.join(cosi.lib_dir, "template", "fetch"));

class Setup extends Registration {
    constructor(quiet) {
        super(quiet);

        this.regConfig = {
            broker: null,
            account: null,
            metricsFile: path.join(this.regDir, "setup-metrics.json"),
            cosiTags: [
                "cosi:install",
                `distro:${this.cosiAPI.args.dist}-${this.cosiAPI.args.vers}`,
                `arch:${this.cosiAPI.args.arch}`,
                `os:${this.cosiAPI.args.type}`
            ],
            cosiNotes: `cosi:register,cosi_id:${this.cosiId}`,
            templateData: {
                host_name: this.customOptions.host_name ? this.customOptions.host_name : os.hostname(),
                host_target: this.customOptions.host_target ? this.customOptions.host_target : this._getDefaultHostIp(),
                host_vars: this.customOptions.host_vars ? this.customOptions.host_vars : {}
            }
        };

        this.regConfig.templateData.host_vars.num_cpus = os.cpus().length;

        this.metricGroups = [];

    }

    setup() {
        console.log(chalk.bold("Registration Setup"));

        const self = this;

        this.once("verify.api", this.verifyCirconusAPI);
        this.once("verify.api.done", () => {
            self.emit("metrics.fetch");
        });

        this.once("metrics.fetch", this.fetchNADMetrics);
        this.once("metrics.fetch.save", this.saveMetrics);
        this.once("metrics.fetch.done", () => {
            self.emit("templates.fetch");
        });

        this.once("templates.fetch", this.fetchTemplates);
        this.once("templates.fetch.done", () => {
            self.emit("verify.broker");
        });

        this.once("verify.broker", this.verifyBroker);
        this.once("verify.broker.done", () => {
            self.emit("save.config");
        });

        this.once("save.config", this.saveRegConfig);

        this.emit("verify.api");
    }

    verifyCirconusAPI() {
        console.log(chalk.blue(this.marker));
        console.log("Verify Circonus API access");

        const self = this;
        const apiKey = this.circonusAPI.key;
        const apiApp = this.circonusAPI.app;
        const apiURL = url.parse(this.circonusAPI.url);

        api.setup(apiKey, apiApp, apiURL);
        api.get("/account/current", null, (code, err, account) => {
            if (err) {
                self.emit("error", err);
                return;
            }

            if (code !== 200) {
                self.emit("error", new Error(`verifyAPI - API return code: ${code} ${err} ${account}`));
            }

            console.log(chalk.green("API key verified"), "for account", account.name, account.description === null ? "" : `- ${account.description}`);

            let accountUrl = account._ui_base_url || "your_account_url";

            if (accountUrl.substr(-1) === "/") {
                accountUrl = accountUrl.substr(0, accountUrl.length - 1);
            }

            self.regConfig.account = {
                name: account.name,
                uiUrl: accountUrl
            };

            self.emit("verify.api.done");

        });
    }


    fetchNADMetrics() {
        console.log(chalk.blue(this.marker));
        console.log("Fetch available metrics from NAD");

        const self = this;
        const metrics = new Metrics(this.agentUrl);

        metrics.load((err) => {
            if (err) {
                self.emit("error", err);
                return;
            }
            console.log(chalk.green("Metrics loaded"));
            metrics.getMetricStats((metricStatsError, stats) => {
                if (metricStatsError) {
                    self.emit("error", metricStatsError);
                }

                let totalMetrics = 0;

                for (const group in stats) {
                    if (stats.hasOwnProperty(group)) {
                        console.log(`\t ${group} has ${stats[group]} metrics`);
                        totalMetrics += stats[group];
                    }
                }

                console.log(`Total metrics: ${totalMetrics}`);
                this.emit("metrics.fetch.save", metrics);
            });
        });
    }


    saveMetrics(metrics) {
        assert.equal(typeof metrics, "object", "metrics is required");

        console.log("Saving available metrics");

        const self = this;

        metrics.getMetrics((metricsError, agentMetrics) => {
            if (metricsError) {
                self.emit("error", metricsError);
                return;
            }
            fs.writeFile(
                self.regConfig.metricsFile,
                JSON.stringify(agentMetrics, null, 4),
                { encoding: "utf8", mode: 0o644, flag: "w" },
                (saveError) => {
                    if (saveError) {
                        self.emit("error", saveError);
                        return;
                    }
                    console.log(chalk.green("Metrics saved", self.regConfig.metricsFile));
                    self.emit("metrics.fetch.done");
                }
            );
        });
    }


    fetchTemplates() {
        console.log(chalk.blue(this.marker));
        console.log("Fetching templates");

        const self = this;

        // DO NOT force in register, if templates have been provisioned, use them
        const templateFetch = new TemplateFetcher(false);

        templateFetch.all(this.quiet, (err, result) => {
            console.log(`Checked ${result.attempts}, fetched ${result.fetched}, errors ${result.error}`);
            if (err) {
                self.emit("error", err);
                return;
            }
            self.emit("templates.fetch.done");
        });
    }


    verifyBroker() {
        console.log(chalk.blue(this.marker));
        console.log("Verify Circonus broker");

        const self = this;
        const broker = new Broker(this.quiet);

        broker.getDefaultBroker((err, defaultBroker) => {
            if (err) {
                self.emit("error", err);
                return;
            }

            self.regConfig.broker = defaultBroker;
            self.emit("verify.broker.done");
        });
    }


    saveRegConfig() {
        console.log(chalk.blue(this.marker));
        console.log("Save registration configuration");

        const self = this;

        fs.writeFile(
            self.regConfigFile,
            JSON.stringify(this.regConfig, null, 4),
            { encoding: "utf8", mode: 0o644, flag: "w" },
            (saveError) => {
                if (saveError) {
                    self.emit("error", saveError);
                    return;
                }
                console.log(chalk.green("Registration configuration saved", self.regConfigFile));
                self.emit("setup.done");
                this.emit("metrics.fetch.done");
            }
        );
    }


    _getDefaultHostIp() {
        const networkInterfaces = os.networkInterfaces();

        for (const iface in networkInterfaces) {
            if (networkInterfaces.hasOwnProperty(iface)) {
                // for (const addr of networkInterfaces[iface]) {
                for (let i = 0; i < networkInterfaces[iface].length; i++) {
                    const addr = networkInterfaces[iface][i];

                    if (!addr.internal && addr.family === "IPv4") {
                        return addr.address;
                    }
                }

            }
        }

        return "0.0.0.0";
    }

}

module.exports = Setup;

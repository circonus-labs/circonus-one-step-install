"use strict";

/*eslint-env node, es6 */
/*eslint-disable no-magic-numbers, global-require */

const assert = require("assert");
const Events = require("events").EventEmitter;
const fs = require("fs");
const path = require("path");

const chalk = require("chalk");

const cosi = require(path.resolve(path.join(__dirname, "..")));
const exec = require("child_process").exec;

const RegSetup = require(path.join(cosi.lib_dir, "registration", "setup"));
const RegConfig = require(path.join(cosi.lib_dir, "registration", "config"));
const RegRegister = require(path.join(cosi.lib_dir, "registration", "register"));

const Check = require(path.resolve(cosi.lib_dir, "check"));
const Graph = require(path.resolve(cosi.lib_dir, "graph"));
const Dashboard = require(path.resolve(cosi.lib_dir, "dashboard"));

class Plugin extends Events {

    constructor(quiet) {
        super();

        this.marker = "==========";

        this.circonusAPI = {
            url: cosi.api_url,
            key: cosi.api_key,
            app: cosi.api_app
        };

        this.cosiAPI = {
            url: cosi.cosi_url,
            args: {
                type: cosi.cosi_os_type,
                dist: cosi.cosi_os_dist,
                vers: cosi.cosi_os_vers,
                arch: cosi.cosi_os_arch
            }
        };

        this.regDir = cosi.reg_dir;
        this.cosiId = cosi.cosi_id;
        this.quiet = quiet;
        this.customOptions = cosi.custom_options;
        this.agentURL = cosi.agent_url;

        this.regConfigFile = path.resolve(cosi.reg_dir, "setup-config.json");

        this.on("error", (err) => {
            console.log(chalk.red("***************"));
            console.dir(err);
            console.log(chalk.red("***************"));
            process.exit(1); //eslint-disable-line no-process-exit
        });
    }

    _fileExists(cfgFile) {
        assert.equal(typeof cfgFile, "string", "cfgFile is required");

        try {
            const stats = fs.statSync(cfgFile);

            return stats.isFile();

        }
        catch (err) {
            if (err.code !== "ENOENT") {
                this.emit("error", err);
            }
        }

        return false;
    }

    _execShell(path, doneEvent) {
        const self = this;

        exec(path, (error, stdout, stderr) => {
            if (error) {
                self.emit("error", error);
                return;
            }
            self.emit(doneEvent, stdout);
        });
    }

    addCustomMetrics() {
        /* noop in base class */
    }

    reregisterHost(quiet) {
        const self = this;

        this.once("reg-setup", () => {
            const regSetup = new RegSetup(quiet);

            regSetup.once("setup.done", () => {
                self.emit("reg-config");
            });

            regSetup.setup();
        });


        this.once("reg-config", () => {
            const regConfig = new RegConfig(quiet);

            regConfig.once("config.done", () => {
                self.emit("reg-register");
            });

            regConfig.config();
        });


        this.once("reg-register", () => {
            const regRegister = new RegRegister(quiet);

            regRegister.once("register.done", () => {

                self.emit("register.done");
            });

            regRegister.register();
        });

        if (fs.existsSync(path.resolve(this.regDir, "setup-metrics.json"))) {
            // metrics likely changed, delete cache of metrics to force a reget
            fs.unlinkSync(path.resolve(this.regDir, "setup-metrics.json"));
        }

        console.log("Adding custom metrics");
        self.addCustomMetrics();

        // nad has a delay to pick up the newly linked metrics as the file system
        // watch takes a bit to trigger and then nad needs a moment to refresh
        // the modules it needs to execute
        setTimeout(() => {
            self.emit("reg-setup");
        }, 5000);
    }

    configDashboard(name, quiet, dashboard_items, fsGraphId) {
        const self = this;
        const regConfig = new RegConfig(quiet);
        const regSetup = new RegSetup(quiet);

        regConfig.loadRegConfig();
        regConfig.loadMetrics();

        /* this can get emitted multiple times */
        regConfig.on("dashboard.config.done", (cfgFile) => {
            self.registerDashboard(cfgFile, self.params.quiet);
        });

        regSetup.once("templates.fetch.done", () => {
            regConfig.configDashboard(name, dashboard_items, fsGraphId);
        });

        regSetup.fetchTemplates([ `dashboard-${name}` ]);
    }

    registerDashboard(cfgFile, quiet) {
        const self = this;
        const regRegister = new RegRegister(quiet);

        regRegister.loadRegConfig();

        regRegister.once("dashboard.done", () => {
            self.emit("dashboard.done");
        });

        regRegister.dashboard(cfgFile);
    }

    disablePlugin(pluginName, dashboardPrefix, graphPrefix) {
        const self = this;

        this.once("deconfig.plugin", () => {

            /* find all related graphs and dashboards for this plugin */
            let files = null;
            const removeMetrics = [];
            const removeFiles = [];
            let deconfiguredCount = 0;
            let expectCount = 0;

            try {
                files = fs.readdirSync(self.regDir);
            }
            catch (err) {
                self.emit(err);
                return;
            }

            for (let i = 0; i < files.length; i++) {
                const file = path.resolve(self.regDir, files[i]);
                if (files[i].indexOf(`registration-dashboard-${dashboardPrefix}`) != -1) {
                    const dash = require(file);
                    for (let j = 0; j < dash.widgets.length; j++) {
                        const w = dash.widgets[j];
                        if (w.name == "Gauge") {
                            removeMetrics.push(w.settings.metric_name);
                        }
                    }
                    removeFiles.push({ "t" : "dash", file });
                }
                if (files[i].indexOf(`registration-graph-${graphPrefix}`) != -1 ) {
                    const graph = require(file);
                    for (let j = 0; j < graph.datapoints.length; j++) {
                        const dp = graph.datapoints[j];
                        removeMetrics.push(dp.metric_name);
                    }
                    removeFiles.push({ "t" : "graph", file });
                }
            }
            expectCount = removeFiles.length;
            self.on("item.deconfigured", () => {
                deconfiguredCount++;
                if (deconfiguredCount == expectCount) {
                    self.emit("plugin.done");
                }
            });

            const check = new Check(path.resolve(self.regDir, "registration-check-system.json"));
            const checkMetrics = check.metrics;
            for (let i = 0; i < checkMetrics.length; i++) {
                for (let j = 0; j < removeMetrics.length; j++) {
                    if (checkMetrics[i].name == removeMetrics[j]) {
                        checkMetrics.splice(i, 1);
                        i--;
                    }
                }
            }
            check.metrics = checkMetrics;
            check.update((err) => {
                if (err) {
                    self.emit(err);
                    return;
                }
                console.log("Updated system check with removed metrics");

                /* now remove all the graphs and dashboards we found above */
                for (let i = 0; i < removeFiles.length; i++) {
                    console.log(`Removing: ${removeFiles[i].file}`);
                    if (removeFiles[i].t == "dash" ) {
                        const dash = new Dashboard(removeFiles[i].file);
                        dash.remove((err) => {
                            // if (err) {
                            //     console.log(err);
                            //     self.emit(err);
                            //     return;
                            // }
                            const cfgFile = removeFiles[i].file.replace("registration-", "config-");
                            console.log(`Removing file: ${removeFiles[i].file}`);
                            fs.unlinkSync(removeFiles[i].file);
                            console.log(`Removing file: ${cfgFile}`);
                            fs.unlinkSync(cfgFile);
                            self.emit("item.deconfigured");
                        });
                    }
                    if (removeFiles[i].t == "graph" ) {
                        const graph = new Graph(removeFiles[i].file);
                        graph.remove((err) => {
                            if (err) {
                                console.log(err);
                                self.emit(err);
                                return;
                            }
                            const cfgFile = removeFiles[i].file.replace("registration-", "config-");
                            console.log(`Removing file: ${removeFiles[i].file}`);
                            fs.unlinkSync(removeFiles[i].file);
                            console.log(`Removing file: ${cfgFile}`);
                            fs.unlinkSync(cfgFile);
                            self.emit("item.deconfigured");
                        });
                    }
                }
            });
        });

        this.once("nad.disabled", (stdout) => {
            self.emit("deconfig.plugin");
        });


        const script = path.resolve(path.join(__dirname, pluginName, "nad-disable.sh"));

        self._execShell(script, "nad.disabled");

    }
}

module.exports = Plugin;

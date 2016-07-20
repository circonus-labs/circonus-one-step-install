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
        exec(path, (error, stdout, stderr) => {
            if (error) {
                this.emit("error", error);
                return;
            }
            this.emit(doneEvent, stdout);
        });
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

        // metrics likely changed, delete cache of metrics to force a reget
        fs.unlinkSync(path.resolve(this.regDir, "setup-metrics.json"));
        
        // nad has a delay to pick up the newly linked metrics as the file system
        // watch takes a bit to trigger and then nad needs a moment to refresh 
        // the modules it needs to execute
        setTimeout(function() {
            self.emit("reg-setup");
        }, 5000);
    }

    configDashboard(name, quiet, dashboard_items) {
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
            regConfig.configDashboard(name, dashboard_items);
        });        

        regSetup.fetchTemplates([`dashboard-${name}`]);
    }

    registerDashboard(cfgFile, quiet) {
        const self = this;
        const regRegister = new RegRegister(quiet);
        regRegister.once("dashboard.done", () => {
            self.emit("dashboard.done");
        });

        regRegister.dashboard(cfgFile);
    }
}

module.exports = Plugin;

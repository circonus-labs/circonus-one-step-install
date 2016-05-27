/*eslint-env node, es6 */
/*eslint-disable no-magic-numbers, camelcase, no-process-exit, global-require */
"use strict";

const path = require("path");
const crypto = require("crypto");
const fs = require("fs");

const chalk = require("chalk");

const pkg = require(path.resolve(path.join(__dirname, "..", "..", "package.json")));

let instance = null;

class COSI {
    constructor() {
        if (instance !== null) {
            return instance;
        }

        instance = this;  //eslint-disable-line consistent-this

        instance.app_name = pkg.name;
        instance.app_version = pkg.version;
        instance.description = pkg.description;
        instance.bug_url = pkg.bugs.url;
        instance.support_url = "https://support.circonus.com/";

        instance.cosi_dir = path.resolve(path.join(__dirname, "..", ".."));
        instance.lib_dir = __dirname;
        instance.etc_dir = path.resolve(path.join(instance.cosi_dir, "etc"));
        instance.reg_dir = path.resolve(path.join(instance.cosi_dir, "registration"));
        instance.ruleset_dir = path.resolve(path.join(instance.cosi_dir, "rulesets"));

        const configFile = path.resolve(path.join(instance.etc_dir, "cosi.json"));
        let cfg = {};

        try {
            cfg = require(configFile);
        }
        catch (err) {
            if (err.code === "MODULE_NOT_FOUND") {
                console.error(chalk.red(`Configuration file '${configFile}' not found!`));
                process.exit(1);
            }
            else {
                throw err;
            }
        }

        const requiredSettings = [
            "api_key",
            "api_app",
            "api_url",
            "cosi_url",
            "agent_mode",
            "agent_url",
            "statsd_type",
            "cosi_os_type",
            "cosi_os_dist",
            "cosi_os_vers",
            "cosi_os_arch"
        ];

        //for (const prop of requiredSettings) {
        for (let i = 0; i < requiredSettings.length; i++) {
            const prop = requiredSettings[i];

            if (cfg.hasOwnProperty(prop)) {
                instance[prop] = cfg[prop];
            }
            else {
                console.error(chalk.red("ERROR"), "configuration missing required setting", prop);
                process.exit(1);
            }
        }

        const optionalSettings = [
            "cosi_host_target",
            "cosi_broker_id"
        ];

        for (let i = 0; i < optionalSettings.length; i++) {
            const prop = optionalSettings[i];

            if (cfg.hasOwnProperty(prop) && cfg[prop] !== "") {
                instance[prop] = cfg[prop];
            }
        }

        // used for aws public hostname detection for check target
        if (cfg.hasOwnProperty("cosi_os_dmi") && cfg.cosi_os_dmi !== "") {
            instance.dmi_bios_ver = cfg.cosi_os_dmi;
        }

        const idFile = path.resolve(path.join(instance.etc_dir, ".cosi_id"));

        try {
            const cosi_id = fs.readFileSync(idFile, { encoding: "utf8" });

            instance.cosi_id = cosi_id.trim();
        }
        catch (readError) {
            if (readError.code !== "ENOENT") {
                console.error("Unable to read", idFile, readError);
                process.exit(1);
            }

            instance.cosi_id = crypto.createHash("sha256").update(crypto.randomBytes(2048)).digest("hex");
            try {
                fs.writeFileSync(idFile, instance.cosi_id);
            }
            catch (writeError) {
                console.error("Unable to save", idFile, writeError);
            }
        }

        instance.custom_options = {};
        if (cfg.hasOwnProperty("custom_options_file") && cfg.custom_options_file.length > 0) {
            const custCfgFile = path.resolve(cfg.custom_options_file);

            try {
                instance.custom_options = require(custCfgFile);
            }
            catch (custCfgErr) {
                console.error(chalk.red("ERROR"), "unable to load specified custom options file", custCfgErr);
                process.exit(1);
            }
        }

        instance.ui_url = null;
        try {
            const regInfoFile = path.resolve(path.join(__dirname, "..", "..", "registration", "setup-config.json"));
            const info = require(regInfoFile);

            instance.ui_url = info.account.uiUrl;
        }
        catch (err) {
            // ignore
        }

        return instance;
    }
}

module.exports = new COSI();

"use strict";

/*eslint-env node, es6 */
/*eslint-disable no-magic-numbers, global-require */

const assert = require("assert");
const Events = require("events").EventEmitter;
const fs = require("fs");
const path = require("path");

const chalk = require("chalk");

chalk.enabled = true;

const cosi = require(path.resolve(path.join(__dirname, "..")));

class Registration extends Events {

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

        this.agentUrl = cosi.agent_url;
        this.agentMode = cosi.agent_mode;
        this.regDir = cosi.reg_dir;
        this.cosiId = cosi.cosi_id;
        this.statsd = cosi.statsd_type;
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

}

module.exports = Registration;

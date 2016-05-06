#!/usr/bin/env node

/*eslint-env node, es6 */
/*eslint-disable no-magic-numbers, no-process-exit */

"use strict";

const path = require("path");
const fs = require("fs");

const app = require("commander");
const chalk = require("chalk");

const cosi = require(path.resolve(path.join(__dirname, "..", "lib", "cosi")));
const Ruleset = require(path.join(cosi.lib_dir, "ruleset"));

function createRulesets(rulesets) {
    for (let i = 0; i < rulesets.length; i++) {
        const cfgFile = rulesets[i];
        const regFile = cfgFile.replace(".json", "-cosi.json");
        let submitRuleset = false;

        try {
            fs.statSync(regFile);
            console.log(chalk.yellow("WARN"), regFile, "already exists, skipping.");
        }
        catch (err) {
            if (err.code === "ENOENT") {
                submitRuleset = true;
            }
            else {
                console.error(chalk.red("ERROR"), `accessing ${regFile}, skipping`, err);
            }
        }

        if (submitRuleset) {
            console.log("Sending", cfgFile, "to Circonus API.");
            const ruleset = new Ruleset(cfgFile);

            ruleset.create((errCreate) => {
                if (errCreate) {
                    console.error(chalk.red(`Error: ${errCreate.code} -- ${errCreate.message}`));
                    if (errCreate.details) {
                        console.error(errCreate.details);
                    }
                    console.dir(errCreate);
                }
                else {
                    ruleset.save(regFile, true);
                    console.log(chalk.green("Saved"), regFile);
                }
            });
        }
    }
}

app.
    version(cosi.app_version).
    option("-c, --config <file>", `specific config file (default: ${cosi.ruleset_dir}/*.json)`).
    parse(process.argv);

console.log(chalk.bold(app.name()), `v${app.version()}`);

process.on("createRuleSets", createRulesets);

if (app.config) {
    const rulesets = [ path.resolve(app.config) ];

    process.emit("createRuleSets", rulesets);
}
else {
    fs.readdir(cosi.ruleset_dir, (err, files) => {
        if (err) {
            console.error(chalk.red("ERROR"), "reading ruleset directory.", err);
            process.exit(1);
        }

        if (files.length === 0) {
            console.log(chalk.yellow("WARN"), `no rulesets found in ${cosi.ruleset_dir}`);
            process.exit(0);
        }

        const rulesets = [];

        for (let i = 0; i < files.length; i++) {
            const cfgFile = path.resolve(path.join(cosi.ruleset_dir, files[i]));

            if (cfgFile.match(/\.json$/) && cfgFile.indexOf("-cosi.json") === -1) {
                if (path.basename(cfgFile) !== "template-ruleset.json") {
                    rulesets.push(cfgFile);
                }
            }
        }

        process.emit("createRuleSets", rulesets);
    });
}

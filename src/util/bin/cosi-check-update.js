#!/usr/bin/env node

/*eslint-env node, es6 */
/*eslint-disable no-magic-numbers */

"use strict";

const path = require("path");

const app = require("commander");
const chalk = require("chalk");

const cosi = require(path.resolve(path.join(__dirname, "..", "lib", "cosi")));
const Check = require(path.join(cosi.lib_dir, "check"));

app.
    version(cosi.app_version).
    usage("[options] <config_file>").
    parse(process.argv);

console.log(chalk.bold(app.name()), `v${app.version()}`);

if (app.args.length === 0) {
    console.error(chalk.red("config_file is requried"));
    app.outputHelp();
    process.exit(1); //eslint-disable-line no-process-exit
}

const cfgFile = path.resolve(app.args[0]);
const check = new Check(cfgFile);

check.update((err, result) => {
    if (err) {
        console.error(chalk.red(`Error: ${err.code} -- ${err.message}`));
        if (err.details) {
            console.error(err.details.join("\n"));
        }
        console.dir(err);
        process.exit(1); //eslint-disable-line no-process-exit
    }

    check.save(cfgFile, true);
    console.log(chalk.green("Updated"), result.display_name);
});

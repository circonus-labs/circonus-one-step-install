#!/usr/bin/env node

/*eslint-env node, es6 */
/*eslint-disable no-magic-numbers */

"use strict";

const path = require("path");
const fs = require("fs");

const app = require("commander");
const chalk = require("chalk");

const cosi = require(path.resolve(path.join(__dirname, "..", "lib", "cosi")));
const Graph = require(path.join(cosi.lib_dir, "graph"));

app.
    version(cosi.app_version).
    usage("[options] <config_file>").
    option("-f, --force", "force overwrite, if output exists").
    option("-o, --output <file>", "output file [stdout]").
    parse(process.argv);

console.log(chalk.bold(app.name()), `v${app.version()}`);

if (app.args.length === 0) {
    console.error(chalk.red("config_file is requried"));
    app.outputHelp();
    process.exit(1); //eslint-disable-line no-process-exit
}

const cfgFile = path.resolve(app.args[0]);
const graph = new Graph(cfgFile);

graph.create((err, result) => {
    if (err) {
        console.error(chalk.red(`Error: ${err.code} -- ${err.message}`));
        if (err.details) {
            console.error(err.details.join("\n"));
        }
        console.dir(err);
        process.exit(1); //eslint-disable-line no-process-exit
    }

    if (app.output) {
        const opts = { encoding: "utf8", mode: 0o644, flag: app.force ? "w" : "wx" };

        fs.writeFileSync(app.output, JSON.stringify(result, null, 4), opts);

    } else {
        console.log(result);
    }
});

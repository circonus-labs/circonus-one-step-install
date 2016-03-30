#!/usr/bin/env node

/*eslint-env node, es6 */
/*eslint-disable no-magic-numbers */

"use strict";

const path = require("path");

const app = require("commander");
const sprintf = require("sprintf-js").sprintf;
const chalk = require("chalk");

const cosi = require(path.resolve(path.join(__dirname, "..", "lib", "cosi")));

const Settings = require(path.join(cosi.libDir, "settings"));
const templateList = require(path.join(cosi.libDir, "template", "list"));

function emitLine(id, type, description) {
    const lineFormat = "%-8s %-8s %-60s";

    if (id) {
        console.log(sprintf(lineFormat, id, type, description));
    } else {
        console.log(chalk.underline(sprintf(lineFormat, "ID", "Type", "Description")));
    }
}

app.
    version(cosi.version).
    option("-q, --quiet", "no header lines").
    parse(process.argv);

if (!app.quiet) {
    console.log(chalk.bold(app.name()), `v${app.version()}`);
}

if (app.config) {
    if (app.config.substr(0, 1) !== "/") {
        app.config = path.resolve(app.config);
    }
}

const settings = new Settings(app.config);

templateList(settings.reg_dir, (err, list) => {
    if (err) {
        console.log("template list, list", err);
        process.exit(1); //eslint-disable-line no-process-exit
    }

    if (list.length === 0) {
        console.error(chalk.red("No templates found"));
        process.exit(1); //eslint-disable-line no-process-exit
    }

    if (!app.quiet) {
        emitLine();
    }

    for (let i = 0; i < list.length; i++) {
        emitLine(
            list[i].config.id,
            list[i].config.type,
            list[i].config.description
        );
    }
});

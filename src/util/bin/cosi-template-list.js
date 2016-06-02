#!/usr/bin/env node

/*eslint-env node, es6 */
/*eslint-disable no-magic-numbers */

"use strict";

const path = require("path");

const app = require("commander");
const sprintf = require("sprintf-js").sprintf;
const chalk = require("chalk");

const cosi = require(path.resolve(path.join(__dirname, "..", "lib", "cosi")));
const templateList = require(path.join(cosi.lib_dir, "template", "list"));

function emitLine(id, type, description) {
    const lineFormat = "%-8s %-8s %-60s";

    if (id) {
        console.log(sprintf(lineFormat, id, type, description));
    }
    else {
        console.log(chalk.underline(sprintf(lineFormat, "ID", "Type", "Description")));
    }
}

app.
    version(cosi.app_version).
    option("-q, --quiet", "no header lines").
    parse(process.argv);

if (!app.quiet) {
    console.log(chalk.bold(app.name()), `v${app.version()}`);
}


templateList(cosi.reg_dir, (err, list) => {
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

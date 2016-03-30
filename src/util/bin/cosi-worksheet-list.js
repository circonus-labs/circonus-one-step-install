#!/usr/bin/env node

/*eslint-env node, es6 */
/*eslint-disable no-magic-numbers */

"use strict";

const path = require("path");

const app = require("commander");
const chalk = require("chalk");
const sprintf = require("sprintf-js").sprintf;

const cosi = require(path.resolve(path.join(__dirname, "..", "lib", "cosi")));
const worksheetList = require(path.join(cosi.lib_dir, "worksheet", "list"));

function emitLine(maxIdLen, id, title, description) {
    const maxTitleLen = 40;
    const maxDescriptionLen = 40;
    const lineFormat = `%-${maxIdLen}s %-${maxTitleLen}s %-${maxDescriptionLen}s`;

    if (id) {
        console.log(sprintf(
            lineFormat,
            id,
            title.length > maxTitleLen ? `${title.substr(0, maxTitleLen - 3)}...` : title,
            description.length > maxDescriptionLen ? `${description.substr(0, maxDescriptionLen - 3)}...` : description
        ));
    }
    else {
        console.log(chalk.underline(sprintf(lineFormat, "ID", "Title", "Description")));
    }
}

function emitLong(worksheet) {
    console.log("================");
    console.log(chalk.bold("Worksheet ID   :"), worksheet.id);
    console.log(chalk.bold("Worksheet Title:"), worksheet.config.title);
    console.log(chalk.bold("Description    :"), worksheet.config.description);
    console.log(chalk.bold("Worksheet URL  :"), chalk.bold(`${cosi.ui_url}${worksheet.config._cid}`));
}

app.
    version(cosi.app_version).
    option("-l, --long", "long listing").
    option("-q, --quiet", "no header lines").
    parse(process.argv);

if (!app.quiet) {
    console.log(chalk.bold(app.name()), `v${app.version()}`);
}

const list = worksheetList();

if (list.length === 0) {
    console.error(chalk.red("No local graphs found"));
    process.exit(1); //eslint-disable-line no-process-exit
}

let maxIdLen = 20;

for (let i = 0; i < list.length; i++) {
    const worksheet = list[i];

    if (worksheet.id.length > maxIdLen) {
        maxIdLen = worksheet.id.length;
    }
}

if (!app.quiet && !app.long) {
    emitLine(maxIdLen);
}

// for (const worksheet of list) {
for (let i = 0; i < list.length; i++) {
    const worksheet = list[i];

    if (app.long) {
        emitLong(worksheet);
    }
    else {
        emitLine(
            maxIdLen,
            worksheet.id,
            worksheet.config.title,
            worksheet.config.description
        );
    }
}

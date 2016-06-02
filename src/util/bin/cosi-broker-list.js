#!/usr/bin/env node

/*eslint-env node, es6 */
/*eslint-disable no-magic-numbers, no-process-exit */

"use strict";

const path = require("path");

const app = require("commander");
const chalk = require("chalk");
const sprintf = require("sprintf-js").sprintf;

const cosi = require(path.resolve(path.join(__dirname, "..", "lib", "cosi")));
const Broker = require(path.join(cosi.lib_dir, "broker"));

function emitLine(quiet, id, name, type) {
    const lineFormat = "%5s %-10s %-20s";

    if (!id) {
        if (!quiet) {
            console.log(chalk.underline(sprintf(lineFormat, "ID", "Type", "Name")));
        }
        return;
    }

    if (quiet) {
        console.log([ id, type, name ].join("|"));
    }
    else {
        console.log(sprintf(lineFormat, id, type, name));
    }

}

app.
    version(cosi.app_version).
    option("-q, --quiet", "no header lines. '|' delimited, parsable output.").
    parse(process.argv);

if (!app.quiet) {
    console.log(chalk.bold(app.name()), `v${app.version()}`);
}

const broker = new Broker(app.quiet);

broker.getBrokerList((err, list) => {
    if (err) {
        process.exit(1);
    }

    emitLine(app.quiet);

    for (let i = 0; i < list.length; i++) {
        const item = list[i];
        const id = item._cid.replace("/broker/", "");
        const type = item._type;
        const name = item._name;

        if (item._name !== "composite") {
            emitLine(app.quiet, id, name, type);
        }
        // for (const detail of item._details) {
        //     console.log(detail.status, detail.ipaddress, detail.cn);
        // }
    }
});

#!/usr/bin/env node

/*eslint-env node, es6 */
/*eslint-disable no-magic-numbers */

"use strict";

const path = require("path");

const app = require("commander");
const chalk = require("chalk");
const sprintf = require("sprintf-js").sprintf;

const cosi = require(path.resolve(path.join(__dirname, "..", "lib", "cosi")));
const Broker = require(path.join(cosi.lib_dir, "broker"));

app.
    version(cosi.app_version).
    usage("[options] <broker_id>").
    option("-q, --quiet", "no header lines").
    parse(process.argv);

if (!app.quiet) {
    console.log(chalk.bold(app.name()), `v${app.version()}`);
}

if (app.args.length !== 1) {
    console.error(chalk.red("\nbroker_id is required."), "See `cosi broker list` for Broker IDs.");
    app.outputHelp();
    process.exit(1); //eslint-disable-line no-process-exit
}

const brokerId = app.args[0];
const broker = new Broker(app.quiet);

broker.getBrokerInfo(brokerId, (err, info) => {
    if (err) {
        console.dir(err);
        throw err;
    }

    const checkTypes = {};
    let maxCheckWidth = 0;
    let active = false;

    for (const detail of info._details) {
        if (detail.status === "active") {
            active = true;
            for (const module of detail.modules) {
                if (module !== "selfcheck") {
                    checkTypes[module] = true;
                    maxCheckWidth = Math.max(maxCheckWidth, module.length);
                }
            }
        }
    }

    if (active) {
        const checkList = Object.keys(checkTypes);
        const width = 10;

        console.log(chalk.bold(sprintf(`%-${width}s`, "ID")), info._cid.replace("/broker/", ""));
        console.log(chalk.bold(sprintf(`%-${width}s`, "Name")), info._name);
        console.log(chalk.bold(sprintf(`%-${width}s`, "Type")), info._type);
        console.log(chalk.bold(sprintf(`%-${width}s`, "Checks")), `${checkList.length} types supported`);

        maxCheckWidth += 2;
        const cols = Math.floor(70 / maxCheckWidth);

        for (let i = 0; i < checkList.length; i += cols) {
            let line = "";

            for (let j = 0; j < cols; j++) {
                line += sprintf(`%-${maxCheckWidth}s`, checkList[i + j] || "");
            }
            console.log(sprintf(`%-${width}s`, ""), line);
        }
    } else {
        console.error(chalk.red(`Broker ${brokerId} is not active.`));
    }
});

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
const bh = new Broker(app.quiet);

bh.getBrokerList((errGBL) => {
    if (errGBL) {
        console.error(chalk.red("ERROR:"), "Fetching broker list from API.", errGBL);
        process.exit(1);
    }

    const broker = bh.getBrokerById(brokerId);

    const checkTypes = {};
    let maxCheckWidth = 0;
    let active = false;

    for (let i = 0; i < broker._details.length; i++) {
        const detail = broker._details[i];

        if (detail.status === "active") {
            active = true;
            for (let j = 0; j < detail.modules.length; j++) {
                const module = detail.modules[j];

                if (module !== "selfcheck" && module.substr(0, 7) !== "hidden:") {
                    checkTypes[module] = true;
                    maxCheckWidth = Math.max(maxCheckWidth, module.length);
                }
            }
        }
    }

    if (active) {
        const checkList = Object.keys(checkTypes);
        const width = 10;

        console.log(chalk.bold(sprintf(`%-${width}s`, "ID")), broker._cid.replace("/broker/", ""));
        console.log(chalk.bold(sprintf(`%-${width}s`, "Name")), broker._name);
        console.log(chalk.bold(sprintf(`%-${width}s`, "Type")), broker._type);
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
    }
    else {
        console.error(chalk.red(`Broker ${brokerId} is not active.`));
    }

});

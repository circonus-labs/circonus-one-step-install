#!/usr/bin/env node

/*eslint-env node, es6 */
/*eslint-disable no-magic-numbers, no-process-exit */

"use strict";

const path = require("path");
const fs = require("fs");

const app = require("commander");
const chalk = require("chalk");
const sprintf = require("sprintf-js").sprintf;

const cosi = require(path.resolve(path.join(__dirname, "..", "lib", "cosi")));
const Ruleset = require(path.join(cosi.lib_dir, "ruleset"));

function emitLine(ruleset, id) {
    const maxMetricNameLen = 45;
    const lineFormat = `%-10s %-${maxMetricNameLen}s %6s %s`;

    if (ruleset) {
        let metricName = ruleset.metric_name;

        if (metricName.length > maxMetricNameLen) {
            metricName = `...${metricName.slice(-(maxMetricNameLen - 3))}`;
        }

        console.log(sprintf(
            lineFormat,
            ruleset.check.replace("/check/", ""),
            metricName,
            ruleset.rules.length,
            id
        ));
    }
    else {
        console.log(chalk.underline(sprintf(lineFormat, "Check", "Metric", "#Rules", "Ruleset ID")));
    }
}

app.
    version(cosi.app_version).
    parse(process.argv);

console.log(chalk.bold(app.name()), `v${app.version()}`);

fs.readdir(cosi.ruleset_dir, (err, files) => {
    if (err) {
        console.error(chalk.red("ERROR"), "reading ruleset directory.", err);
        process.exit(1);
    }

    if (files.length === 0) {
        console.log(chalk.yellow("WARN"), "no COSI rulesets found.");
        return;
    }

    emitLine();

    for (let i = 0; i < files.length; i++) {
        const file = path.resolve(path.join(cosi.ruleset_dir, files[i]));

        if (file.match(/-cosi\.json$/)) {
            const ruleset = new Ruleset(file);

            emitLine(ruleset, path.basename(file).replace("-cosi.json", ""));
        }
    }

});

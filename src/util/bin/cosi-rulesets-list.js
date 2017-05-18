#!/usr/bin/env node

// Copyright 2016 Circonus, Inc. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

'use strict';

const path = require('path');
const fs = require('fs');

const app = require('commander');
const chalk = require('chalk');
const { sprintf } = require('sprintf-js');

const cosi = require(path.resolve(path.join(__dirname, '..', 'lib', 'cosi')));
const Ruleset = require(path.join(cosi.lib_dir, 'ruleset'));

/**
 * generic function to print lines
 * @arg {Object} ruleset object
 * @arg {String} id of ruleset
 * @returns {Undefined} nothing
 */
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
            ruleset.check.replace('/check/', ''),
            metricName,
            ruleset.rules.length,
            id
        ));
    } else {
        console.log(chalk.underline(sprintf(lineFormat, 'Check', 'Metric', '#Rules', 'Ruleset ID')));
    }
}

app.
    version(cosi.app_version).
    parse(process.argv);

console.log(chalk.bold(app.name()), `v${app.version()}`);

fs.readdir(cosi.ruleset_dir, (err, files) => {
    if (err) {
        console.error(chalk.red('ERROR'), 'reading ruleset directory.', err);
        process.exit(1);
    }

    if (files.length === 0) {
        console.log(chalk.yellow('WARN'), 'no COSI rulesets found.');

        return;
    }

    emitLine();

    for (let i = 0; i < files.length; i++) {
        const file = path.resolve(path.join(cosi.ruleset_dir, files[i]));

        if (file.match(/-cosi\.json$/)) {
            const ruleset = new Ruleset(file);

            emitLine(ruleset, path.basename(file).replace('-cosi.json', ''));
        }
    }
});

#!/usr/bin/env node

// Copyright 2016 Circonus, Inc. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

'use strict';

const path = require('path');

const app = require('commander');
const chalk = require('chalk');

const cosi = require(path.resolve(path.join(__dirname, '..', 'lib', 'cosi')));
const Setup = require(path.resolve(path.join(cosi.lib_dir, 'registration', 'setup')));
const Checks = require(path.resolve(path.join(cosi.lib_dir, 'registration', 'checks')));
const Graphs = require(path.resolve(path.join(cosi.lib_dir, 'registration', 'graphs')));
const Worksheets = require(path.resolve(path.join(cosi.lib_dir, 'registration', 'worksheets')));
const Dashboards = require(path.resolve(path.join(cosi.lib_dir, 'registration', 'dashboards')));

app.
    version(cosi.app_version).
    option('-q, --quiet', 'only error output').
    parse(process.argv);

if (!app.quiet) {
    console.log(chalk.bold('\nRegistration - creating checks and visuals\n'));
}

const setup = new Setup(app.quiet);

setup.setup().
    then(() => {
        const checks = new Checks(app.quiet);

        return checks.create();
    }).
    then(() => {
        const graphs = new Graphs(app.quiet);

        return graphs.create();
    }).
    then(() => {
        const worksheets = new Worksheets(app.quiet);

        return worksheets.create();
    }).
    then(() => {
        const dashboards = new Dashboards(app.quiet);

        return dashboards.create();
    }).
    then(() => {
        // update check with any new metrics
        const checks = new Checks(app.quiet);

        return checks.update();
    }).
    then(() => {
        console.log(chalk.green('\n\nRegistration complete\n'));
    }).
    catch((err) => {
        console.error(chalk.red('ERROR:'), 'during registration', err);
        process.exit(1);
    });

// END

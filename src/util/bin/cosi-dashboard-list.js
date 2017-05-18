#!/usr/bin/env node

// Copyright 2016 Circonus, Inc. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

'use strict';

const path = require('path');

const app = require('commander');
const chalk = require('chalk');
const { sprintf } = require('sprintf-js');

const cosi = require(path.resolve(path.join(__dirname, '..', 'lib', 'cosi')));
const dashList = require(path.join(cosi.lib_dir, 'dashboard', 'list'));

/**
 * generic function to print lines
 * @arg {Number} maxIdLen max length of an ID
 * @arg {String} id dashboard uuid
 * @arg {String} title of dashboard
 * @returns {Undefined} nothing
 */
function emitLine(maxIdLen, id, title) {
    const maxTitleLen = 40;
    const lineFormat = `%-${maxIdLen}s %-${maxTitleLen}s`;

    if (id) {
        console.log(sprintf(
            lineFormat,
            id,
            title.length > maxTitleLen ? `${title.substr(0, maxTitleLen - 3)}...` : title
        ));
    } else {
        console.log(chalk.underline(sprintf(lineFormat, 'ID', 'Title')));
    }
}

/**
 * generic function to print info in long format
 * @arg {Object} dash dashboard definition
 * @returns {Undefined} nothing
 */
function emitLong(dash) {
    console.log('================');
    console.log(chalk.bold('Dashboard ID   :'), dash.id);
    console.log(chalk.bold('Dashboard Title:'), dash.config.title);
    console.log(chalk.bold('Dashboard URL  :'), chalk.bold(`${cosi.ui_url}/dashboards/view/${dash.config._dashboard_uuid}`));
}

app.
    version(cosi.app_version).
    option('-l, --long', 'long listing').
    option('-q, --quiet', 'no header lines').
    parse(process.argv);

if (!app.quiet) {
    console.log(chalk.bold(app.name()), `v${app.version()}`);
}

const list = dashList();

if (list.length === 0) {
    console.error(chalk.red('No local dashboards found'));
    process.exit(1);
}

let maxIdLen = 20;

for (let i = 0; i < list.length; i++) {
    const dash = list[i];

    if (dash.id.length > maxIdLen) {
        maxIdLen = dash.id.length;
    }
}

if (!app.quiet && !app.long) {
    emitLine(maxIdLen);
}

for (let i = 0; i < list.length; i++) {
    const dash = list[i];

    if (app.long) {
        emitLong(dash);
    } else {
        emitLine(
            maxIdLen,
            dash.id,
            dash.config.title
        );
    }
}

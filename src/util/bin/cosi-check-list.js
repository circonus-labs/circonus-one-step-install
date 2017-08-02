#!/usr/bin/env node

// Copyright 2016 Circonus, Inc. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

'use strict';

const events = require('events');
const path = require('path');

const app = require('commander');
const chalk = require('chalk');
const ora = require('ora');
const sprintf = require('sprintf-js').sprintf;

const cosi = require(path.resolve(path.join(__dirname, '..', 'lib', 'cosi')));
const checkList = require(path.join(cosi.lib_dir, 'check', 'list'));
const verifyCheck = require(path.join(cosi.lib_dir, 'check', 'verify'));

/**
 * generic function to print lines
 * @arg {Object} check definition
 * @arg {String} status of check (from api)
 * @returns {Undefined} nothing
 */
function emitLine(check, status) {
    const lineFormat = '%-12s %-40s %-10s %8s %-25s %-8s';

    if (check) {
        const lastModfied = new Date(check.config._last_modified * 1000);

        console.log(sprintf(
            lineFormat,
            check.id,
            check.config.display_name.substr(0, 40),
            check.config.type,
            check.config.metrics.length.toString(),
            lastModfied.toISOString(),
            status));
    } else {
        console.log(chalk.underline(sprintf(lineFormat, 'ID', 'Name', 'Type', '#Active', 'Modified', 'Status')));
    }
}

/**
 * generic function to print info in long format
 * @arg {Object} check definition
 * @arg {String} status of check (from api)
 * @returns {Undefined} nothing
 */
function emitLong(check, status) {
    const lastModfied = new Date(check.config._last_modified * 1000);

    console.log('================');
    console.log(chalk.bold('Check ID       :'), check.id);
    console.log(chalk.bold('Check Name     :'), check.config.display_name);
    console.log(chalk.bold('Check Type     :'), check.config.type);
    console.log(chalk.bold('Active metrics :'), check.config.metrics.length);
    console.log(chalk.bold('Last modified  :'), lastModfied.toString());
    if (status) {
        console.log(chalk.bold('Check status   :'), status);
    }
    for (let i = 0; i < check.config._checks.length; i++) {
        console.log(chalk.bold('Check URL      :'), chalk.bold(`${cosi.ui_url}${check.config._checks[i].replace('check', 'checks')}`));
    }
}

app.
    version(cosi.app_version).
    option('-q, --quiet', 'no header lines').
    option('-l, --long', 'long listing').
    option('--verify', 'verify local checks using Circonus API').
    parse(process.argv);

if (!app.quiet) {
    console.log(chalk.bold(app.name()), `v${app.version()}`);
}

const list = checkList();

if (list.length === 0) {
    console.error(chalk.red('No local checks found'));
    process.exit(1);
}

if (!app.quiet && !app.long) {
    emitLine();
}

if (!app.verify) {
    for (let i = 0; i < list.length; i++) {
        const check = list[i];

        if (app.long) {
            emitLong(check);
        } else {
            emitLine(check, 'n/a');
        }
    }
    process.exit(0);
}

const emitter = new events.EventEmitter();

emitter.on('next', () => {
    const check = list.shift();

    if (typeof check === 'undefined') {
        emitter.removeAllListeners('next');

        return;
    }

    const spinner = ora({
        spinner : 'line',
        text    : 'Verifying...'
    });

    spinner.start();

    verifyCheck(check.config).
        then((valid) => {
            const status = valid ? chalk.green('OK') : chalk.red('Modified');

            spinner.stop();

            if (app.long) {
                emitLong(check, status);
            } else {
                emitLine(check, status);
            }
            emitter.emit('next');
        }).
        catch((err) => {
            spinner.stop();
            console.log('check list, verify', errVerify);
            emitter.emit('next');
        });
});

// start processing list of checks
emitter.emit('next');

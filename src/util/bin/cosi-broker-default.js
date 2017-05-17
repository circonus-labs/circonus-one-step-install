#!/usr/bin/env node

// Copyright 2016 Circonus, Inc. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

/* eslint-disable no-restricted-properties */
/* eslint-disable no-underscore-dangle */

'use strict';

const path = require('path');

const app = require('commander');
const chalk = require('chalk');

const cosi = require(path.resolve(path.join(__dirname, '..', 'lib', 'cosi')));
const Broker = require(path.join(cosi.lib_dir, 'broker'));

app.
    version(cosi.app_version).
    option('-q, --quiet', "no header lines. '|' delimited, parsable output.").
    parse(process.argv);

if (!app.quiet) {
    console.log(chalk.bold(app.name()), `v${app.version()}`);
}

const bh = new Broker(app.quiet);
let checkType = 'json';

console.log(cosi.cosi_os_type, cosi.cosi_os_dist, `v${cosi.cosi_os_vers}`, cosi.cosi_os_arch, cosi.agent_mode, 'agent mode.');

console.log(chalk.bold('====='));
console.log('Determining default broker for check type', checkType);

bh.getDefaultBroker(checkType, (err, broker) => {
    if (err) {
        console.dir(err);
        throw err;
    }

    console.log(chalk.bold('Default broker:'), 'for check type', checkType, broker._cid.replace('/broker/', ''), '-', broker._name);

    checkType = 'httptrap';
    console.log(chalk.bold('====='));
    console.log('Determining default broker for check type', checkType);

    bh.getDefaultBroker(checkType, (err2, broker2) => {
        if (err2) {
            console.dir(err2);
            throw err2;
        }

        console.log(chalk.bold('Default'), 'broker for', checkType, 'check type:', broker._cid.replace('/broker/', ''), '-', broker2._name);
    });
});

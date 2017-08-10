#!/usr/bin/env node

// Copyright 2016 Circonus, Inc. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

'use strict';

const path = require('path');

const app = require('commander');
const chalk = require('chalk');

const cosi = require(path.resolve(path.join(__dirname, '..', 'lib', 'cosi')));
const Broker = require(path.join(cosi.lib_dir, 'broker'));

/**
 * emit line to console
 * @arg {Boolean} quiet display verbose information
 * @arg {String} ctype check type
 * @arg {String} cid broker cid
 * @arg {String} name broker name
 * @returns {Undefined} nothing
 */
function emitLine(quiet, ctype, cid, name) {
    if (quiet) {
        if (cid && name) {
            console.log(`${ctype}|${cid.replace('/broker/', '')}|${name}`);
        }
    } else {
        if (!cid) {
            console.log(chalk.bold('====='));
            console.log('Determining default broker for check type', ctype);

            return;
        }
        console.log(chalk.bold('Default broker:'), 'for check type', ctype, cid.replace('/broker/', ''), '-', name);
    }
}

app.
    version(cosi.app_version).
    option('-q, --quiet', "no header lines. '|' delimited, parsable output.").
    parse(process.argv);

if (!app.quiet) {
    console.log(chalk.bold(app.name()), `v${app.version()}`);
}

const bh = new Broker(app.quiet);
let checkType = 'json';

if (!app.quiet) {
    console.log(cosi.cosi_os_type, cosi.cosi_os_dist, `v${cosi.cosi_os_vers}`, cosi.cosi_os_arch, cosi.agent_mode, 'agent mode.');
}

emitLine(app.quiet, checkType);

bh.getDefaultBroker(checkType).
    then((broker) => {
        emitLine(app.quiet, checkType, broker._cid, broker._name);

        checkType = 'httptrap';
        emitLine(app.quiet, checkType);

        return bh.getDefaultBroker(checkType);
    }).
    then((broker) => {
        emitLine(app.quiet, checkType, broker._cid, broker._name);
    }).
    catch((err) => {
        console.error(chalk.red('ERROR:'), err);
        process.exit(1);
    });

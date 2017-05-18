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
const Broker = require(path.join(cosi.lib_dir, 'broker'));

/**
 * generic function to print lines
 * @arg {Boolean} quiet or verbose
 * @arg {String} id broker id
 * @arg {String} name broker name
 * @arg {String} type broker type
 * @returns {Undefined} nothing
 */
function emitLine(quiet, id, name, type) {
    const lineFormat = '%5s %-10s %-20s';

    if (!id) {
        if (!quiet) {
            console.log(chalk.underline(sprintf(lineFormat, 'ID', 'Type', 'Name')));
        }

        return;
    }

    if (quiet) {
        console.log([ id, type, name ].join('|'));
    } else {
        console.log(sprintf(lineFormat, id, type, name));
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

bh.getBrokerList((err, brokers) => {
    if (err) {
        process.exit(1);
    }

    emitLine(app.quiet);

    for (let i = 0; i < brokers.length; i++) {
        const broker = brokers[i];
        const id = broker._cid.replace('/broker/', '');
        const type = broker._type;
        const name = broker._name;

        if (name !== 'composite') {
            emitLine(app.quiet, id, name, type);
        }
    }
});

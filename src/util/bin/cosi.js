#!/usr/bin/env node

// Copyright 2016 Circonus, Inc. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

'use strict';

const path = require('path');

const app = require('commander');
const chalk = require('chalk');

const cosi = require(path.resolve(path.join(__dirname, '..', 'lib', 'cosi')));

app.
    version(cosi.app_version).
    command('check', 'COSI check actions').
    command('graph', 'COSI graph actions').
    command('worksheet', 'COSI worksheet actions').
    command('rulesets', 'Manage Alert rule sets').
    command('plugin', 'Manage agent plugins').
    // command("metrics", "NAD metrics for this host").
    command('template', 'COSI check & graph template actions').
    command('broker', 'Circonus broker information actions').
    command('register', 'Register host using COSI templates & configuration').
    command('reset', 'Remove COSI checks, graphs, and worksheets');

app.on('--help', () => {
    console.log(chalk.bold('COSI Utilities'), '\n');
    console.log([
        `A suite of tools for working with ${chalk.bold('COSI')} checks, graphs, and worksheets.`,
        `The context of these tools is ${chalk.underline('this')} host. Meaning, limited to what checks,`,
        `metrics, graphs, and worksheets were created ${chalk.bold('by')} COSI ${chalk.bold('on')} this host.`
    ].join('\n'));

    console.log('\nFor example:\n');

    console.log('\t$ cosi check list');

    console.log('\nWill list the checks for this host which were created with this tool.');
    console.log('There may be other checks in Circonus which were not created by COSI.');

    console.log('\n');
});

app.parse(process.argv);

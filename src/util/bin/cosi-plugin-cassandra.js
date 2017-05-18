#!/usr/bin/env node

// Copyright 2016 Circonus, Inc. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

'use strict';

const path = require('path');

const app = require('commander');
const chalk = require('chalk');

const cosi = require(path.resolve(path.join(__dirname, '..', 'lib', 'cosi')));
const Cassandra = require(path.resolve(path.join(cosi.lib_dir, 'plugins', 'cassandra')));

app.
    version(cosi.app_version).
    option('--disable', 'disable the postgres plugin').
    option('--enable', 'enable the postgres plugin').
    option('--force', 'overwrite plugin configs if already enabled').
    option('--iface <interface>', 'which interface is listening on tcp:9042').
    option('--noregister', 'do not perform automatic registration step').
    parse(process.argv);

if (!app.quiet) {
    console.log(chalk.bold(app.name()), `v${app.version()}`);
}

if (app.enable && app.disable) {
    app.outputHelp();
    console.error(chalk.red('ERROR'), chalk.bold('enable'), 'and', chalk.bold('disable'), 'are mutually exclusive');
    process.exit(1);
}

if (!app.enable && !app.disable) {
    app.outputHelp();
    console.error(chalk.red('ERROR'), 'must specify one of', chalk.bold('enable'), 'or', chalk.bold('disable'));
    process.exit(1);
}


const plugin = new Cassandra(app);

plugin.once('plugin.done', (err) => {
    if (err !== null) {
        console.error(chalk.red('ERROR'), err);
        process.exit(1);
    }
    console.log(chalk.blue('SUCCESS'), 'Cassandra plugin was', app.enable ? 'enabled' : 'disabled');
});

if (app.enable) {
    plugin.enable();
} else {
    plugin.disable();
}

// END

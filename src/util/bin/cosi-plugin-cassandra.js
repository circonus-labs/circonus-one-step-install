#!/usr/bin/env node

/* eslint-env node, es6 */

/* eslint-disable no-process-exit */

'use strict';

const path = require('path');

const app = require('commander');
const chalk = require('chalk');

const cosi = require(path.resolve(path.join(__dirname, '..', 'lib', 'cosi')));
const Cassandra = require(path.resolve(path.join(cosi.lib_dir, 'plugins', 'cassandra')));

app.
    version(cosi.app_version).
    option('--enable', 'enable the postgres plugin').
    option('--disable', 'disable the postgres plugin').
    option('--noregister', 'do not perform automatic registration step').
    option('--force', 'overwrite plugin configs if already enabled').
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

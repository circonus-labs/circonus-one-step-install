#!/usr/bin/env node

// Copyright 2016 Circonus, Inc. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

'use strict';

const path = require('path');

const app = require('commander');
const chalk = require('chalk');

const cosi = require(path.resolve(path.join(__dirname, '..', 'lib', 'cosi')));
const Check = require(path.join(cosi.lib_dir, 'check'));

app.
    version(cosi.app_version).
    usage('[options] <config_file>').
    parse(process.argv);

console.log(chalk.bold(app.name()), `v${app.version()}`);

if (app.args.length === 0) {
    console.error(chalk.red('config_file is requried'));
    app.outputHelp();
    process.exit(1);
}

const cfgFile = path.resolve(app.args[0]);
const check = new Check(cfgFile);

check.update().
    then((updated) => {
        check.save(cfgFile, true);
        console.log(chalk.green('Updated'), updated.display_name);
    }).
    catch((err) => {
        console.error(chalk.red('ERROR:'), err);
        process.exit(1);
    });

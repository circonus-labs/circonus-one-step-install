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
    option('-o, --output <file>', 'output file [stdout]').
    parse(process.argv);

console.log(chalk.bold(app.name()), `v${app.version()}`);

if (app.args.length === 0) {
    console.error(chalk.red('config_file is requried'));
    app.outputHelp();
    process.exit(1);
}

const cfgFile = path.resolve(app.args[0]);
const check = new Check(cfgFile);

check.create().
    then((parsed_body, code, raw_body) => {
        if (code !== 200) {
            const err = new Error('Creating check');

            err.code = code;
            err.parsed_body = parsed_body;
            err.raw_body = raw_body;

            console.error(chalk.red('ERROR'), err);
            process.exit(1);
        }
        if (app.output) {
            check.save(app.output, true);
        } else {
            console.log(parsed_body);
        }
    }).
    catch((err) => {
        console.error(chalk.red(`Error: ${err.code} -- ${err.message}`));
        if (err.details) {
            console.error(err.details.join('\n'));
        }
        console.dir(err);
        process.exit(1);
    });

#!/usr/bin/env node

// Copyright 2016 Circonus, Inc. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

'use strict';

const path = require('path');
const fs = require('fs');

const app = require('commander');
const chalk = require('chalk');

const cosi = require(path.resolve(path.join(__dirname, '..', 'lib', 'cosi')));
const Ruleset = require(path.join(cosi.lib_dir, 'ruleset'));

/**
 * call api to create each individual ruleset
 * @arg {Array} rulesets list of ruleset files
 * @returns {Undefined} nothing
 */
function createRulesets(rulesets) {
    for (const cfg_file of rulesets) {
        const reg_file = cfg_file.replace('.json', '-cosi.json');
        let submit_ruleset = false;

        try {
            fs.statSync(reg_file);
            console.log(chalk.yellow('WARN'), reg_file, 'already exists, skipping.');
        } catch (err) {
            if (err.code === 'ENOENT') {
                submit_ruleset = true;
            } else {
                console.error(chalk.red('ERROR'), `accessing ${reg_file}, skipping`, err);
            }
        }

        if (submit_ruleset) {
            console.log('Sending', cfg_file, 'to Circonus API.');
            const ruleset = new Ruleset(cfg_file);

            ruleset.create((errCreate) => {
                if (errCreate) {
                    console.error(chalk.red(`Error: ${errCreate.code} -- ${errCreate.message}`));
                    if (errCreate.details) {
                        console.error(errCreate.details);
                    }
                    console.dir(errCreate);
                } else {
                    ruleset.save(reg_file, true);
                    console.log(chalk.green('Saved'), reg_file);
                }
            });
        }
    }
}

app.
    version(cosi.app_version).
    option('-c, --config <file>', `specific config file (default: ${cosi.ruleset_dir}/*.json)`).
    parse(process.argv);

console.log(chalk.bold(app.name()), `v${app.version()}`);

process.on('createRuleSets', createRulesets);

if (app.config) {
    const rulesets = [ path.resolve(app.config) ];

    process.emit('createRuleSets', rulesets);
} else {
    fs.readdir(cosi.ruleset_dir, (err, files) => {
        if (err) {
            console.error(chalk.red('ERROR'), 'reading ruleset directory.', err);
            process.exit(1);
        }

        if (files.length === 0) {
            console.log(chalk.yellow('WARN'), `no rulesets found in ${cosi.ruleset_dir}`);
            process.exit(0);
        }

        const rulesets = [];

        for (const file_name of files) {
            const cfg_file = path.resolve(path.join(cosi.ruleset_dir, file_name));

            if (cfg_file.match(/\.json$/) && cfg_file.indexOf('-cosi.json') === -1) {
                if (path.basename(cfg_file) !== 'template-ruleset.json') {
                    rulesets.push(cfg_file);
                }
            }
        }

        process.emit('createRuleSets', rulesets);
    });
}

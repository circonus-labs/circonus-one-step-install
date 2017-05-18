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

app.
    version(cosi.app_version).
    option('-a, --all', `all rulesets in ${cosi.ruleset_dir}`).
    option('--id <id>', 'specific ruleset (see "cosi rulesets list" for ID)').
    parse(process.argv);

console.log(chalk.bold(app.name()), `v${app.version()}`);

if (app.id) {
    const regFile = path.resolve(path.join(cosi.ruleset_dir, `${app.id}-cosi.json`));
    const ruleset = new Ruleset(regFile);

    ruleset.delete((err, result) => {
        if (err) {
            console.error(chalk.red('ERROR'), err);
            process.exit(1);
        }

        if (result) {
            fs.unlink(regFile, (errUnlink) => {
                if (errUnlink) {
                    console.error(chalk.red('ERROR'), 'removing', regFile, errUnlink);
                    process.exit(1);
                }
                console.log(chalk.green('REMOVED'), 'rule', app.id, regFile);
            });
        } else {
            console.error(chalk.yellow('WARN'), 'unable to remove', app.id);
            process.exit(2);
        }
    });

    process.exit(0);
}

if (app.all) {
    fs.readdir(cosi.ruleset_dir, (err, files) => {
        if (err) {
            console.error(chalk.red('ERROR'), 'reading ruleset directory.', err);
            process.exit(1);
        }

        if (files.length === 0) {
            console.log(chalk.yellow('WARN'), 'no COSI rulesets found.');

            return;
        }

        for (let i = 0; i < files.length; i++) {
            const file = path.resolve(path.join(cosi.ruleset_dir, files[i]));

            if (file.match(/-cosi\.json$/)) {
                const ruleset = new Ruleset(file);

                ruleset.delete((errDelete, result) => {
                    if (errDelete) {
                        console.error(chalk.red('ERROR'), errDelete);
                        process.exit(1);
                    }
                    console.dir(result);
                });
            }
        }
    });
} else {
    app.outputHelp();
}

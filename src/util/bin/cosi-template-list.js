#!/usr/bin/env node

// Copyright 2016 Circonus, Inc. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

'use strict';

const path = require('path');

const app = require('commander');
const chalk = require('chalk');
const sprintf = require('sprintf-js').sprintf;

const cosi = require(path.resolve(path.join(__dirname, '..', 'lib', 'cosi')));
const templateList = require(path.join(cosi.lib_dir, 'template', 'list'));

/**
 * generic function to print lines
 * @arg {String} id of template
 * @arg {String} type of template
 * @arg {String} description of template
 * @returns {Undefined} nothing
 */
function emitLine(id, type, description) {
    const lineFormat = '%-8s %-8s %-60s';

    if (id) {
        console.log(sprintf(lineFormat, id, type, description));
    } else {
        console.log(chalk.underline(sprintf(lineFormat, 'ID', 'Type', 'Description')));
    }
}

app.
    version(cosi.app_version).
    option('-q, --quiet', 'no header lines').
    parse(process.argv);

if (!app.quiet) {
    console.log(chalk.bold(app.name()), `v${app.version()}`);
}


templateList(cosi.reg_dir, (err, list) => {
    if (err) {
        console.log('template list', list, err);
        process.exit(1);
    }

    if (list.length === 0) {
        console.error(chalk.red('No templates found'));
        process.exit(1);
    }

    if (!app.quiet) {
        emitLine();
    }

    for (const template of list) {
        emitLine(
            template.id,
            template.type,
            template.description
        );
    }
});

// Copyright 2016 Circonus, Inc. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

'use strict';

const path = require('path');
const fs = require('fs');

const chalk = require('chalk');

const cosi = require(path.resolve(path.join(__dirname, '..', '..')));
const Worksheet = require(path.resolve(path.join(cosi.lib_dir, 'worksheet')));

/**
 * build list of all worksheets in registration directory
 * @returns {Array} of worksheet items
 */
function buildWorksheetList() {
    const worksheets = [];
    let files = null;

    try {
        files = fs.readdirSync(cosi.reg_dir);
    } catch (err) {
        console.error(chalk.red('ERROR accessing registration directory'));
        console.dir(err, { colors: true });
        process.exit(1);
    }

    for (const file of files) {
        if (file.match(/^registration-worksheet-.*\.json$/)) {
            try {
                worksheets.push({
                    config : new Worksheet(path.resolve(path.join(cosi.reg_dir, file))),
                    file,
                    id     : file.replace('registration-', '').replace('.json', '')
                });
            } catch (err) {
                console.error(chalk.yellow('WARN unable to add worksheet to list'));
                console.dir(err, { colors: true });
            }
        }
    }

    return worksheets;
}

module.exports = buildWorksheetList;

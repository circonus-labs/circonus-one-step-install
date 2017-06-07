// Copyright 2016 Circonus, Inc. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

'use strict';

const path = require('path');
const fs = require('fs');

const chalk = require('chalk');

const cosi = require(path.resolve(path.join(__dirname, '..', '..')));
const Check = require(path.resolve(path.join(cosi.lib_dir, 'check')));

/**
 * generate a list of check registrations on the local system
 * @returns {Array} of dashboard objects
 */
function buildCheckList() {
    const checks = [];
    let files = null;

    try {
        files = fs.readdirSync(cosi.reg_dir);
    } catch (err) {
        console.error(chalk.red('ERROR accessing registration directory'));
        console.dir(err, { colors: true });
        process.exit(1);
    }

    for (let i = 0; i < files.length; i++) {
        const file = files[i];

        if (file.match(/^registration-check-.*\.json$/)) {
            const id = file.replace('registration-', '').replace('.json', '');

            try {
                checks.push({
                    config: new Check(path.resolve(path.join(cosi.reg_dir, file))),
                    file,
                    id
                });
            } catch (err) {
                console.error(chalk.yellow('WARN unable to add check to list'));
                console.dir(err, { colors: true });
            }
        }
    }

    return checks;
}

module.exports = buildCheckList;

// END

// Copyright 2016 Circonus, Inc. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

'use strict';

const path = require('path');
const fs = require('fs');

const chalk = require('chalk');

const cosi = require(path.resolve(path.join(__dirname, '..', '..')));
const Dashboard = require(path.resolve(path.join(cosi.lib_dir, 'dashboard')));

/**
 * generate a list of dashboard registrations on the local system
 * @returns {Array} of dashboard objects
 */
function buildDashboardList() {
    const dashboards = [];
    let files = null;

    try {
        files = fs.readdirSync(cosi.reg_dir);
    } catch (err) {
        console.error(chalk.red('ERROR accessing registration directory'));
        console.dir(err, { colors: true });
        process.exit(1);
    }

    for (const file of files) {
        if (file.match(/^registration-dashboard-.*\.json$/)) {
            const id = file.replace('registration-', '').replace('.json', '');

            try {
                dashboards.push({
                    config: new Dashboard(path.resolve(path.join(cosi.reg_dir, file))),
                    file,
                    id
                });
            } catch (err) {
                console.error(chalk.yellow('WARN unable to add dashboard to list'));
                console.dir(err, { colors: true });
            }
        }
    }

    return dashboards;
}

module.exports = buildDashboardList;

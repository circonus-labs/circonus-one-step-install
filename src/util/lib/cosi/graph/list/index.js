// Copyright 2016 Circonus, Inc. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

'use strict';

const path = require('path');
const fs = require('fs');

const chalk = require('chalk');

const cosi = require(path.resolve(path.join(__dirname, '..', '..')));
const Graph = require(path.resolve(path.join(cosi.lib_dir, 'graph')));

/**
 * generate a list of graph registrations on the local system
 * @returns {Array} of graph objects
 */
function buildGraphList() {
    const graphs = [];
    let files = null;

    try {
        files = fs.readdirSync(cosi.reg_dir);
    } catch (err) {
        console.error(chalk.red('ERROR accessing registration directory'));
        console.dir(err, { colors: true });
        process.exit(1);
    }

    for (const file of files) {
        if (file.match(/^registration-graph-.*\.json$/)) {
            const id = file.replace('registration-', '').replace('.json', '');

            try {
                graphs.push({
                    config: new Graph(path.resolve(path.join(cosi.reg_dir, file))),
                    file,
                    id
                });
            } catch (err) {
                console.error(chalk.yellow('WARN unable to add graph to list'));
                console.dir(err, { colors: true });
            }
        }
    }

    return graphs;
}

module.exports = buildGraphList;

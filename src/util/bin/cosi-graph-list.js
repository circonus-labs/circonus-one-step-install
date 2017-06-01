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
const graphList = require(path.join(cosi.lib_dir, 'graph', 'list'));

/**
 * generic function to print lines
 * @arg {Number} maxIdLen max length of an ID
 * @arg {String} id definition
 * @arg {String} title of graph
 * @arg {String} description of graph
 * @returns {Undefined} nothing
 */
function emitLine(maxIdLen, id, title, description) {
    const maxTitleLen = 40;
    const maxDescriptionLen = 40;
    const lineFormat = `%-${maxIdLen}s %-${maxTitleLen}s %-${maxDescriptionLen}s`;

    if (id) {
        console.log(sprintf(
            lineFormat,
            id,
            title.length > maxTitleLen ? `${title.substr(0, maxTitleLen - 3)}...` : title,
            description.length > maxDescriptionLen ? `${description.substr(0, maxDescriptionLen - 3)}...` : description
        ));
    } else {
        console.log(chalk.underline(sprintf(lineFormat, 'ID', 'Title', 'Description')));
    }
}

/**
 * generic function to print info in long format
 * @arg {Object} graph definition
 * @returns {Undefined} nothing
 */
function emitLong(graph) {
    console.log('================');
    console.log(chalk.bold('Graph ID       :'), graph.id);
    console.log(chalk.bold('Graph Title    :'), graph.config.title);
    console.log(chalk.bold('Description    :'), graph.config.description);
    console.log(chalk.bold('Graph URL      :'), chalk.bold(`${cosi.ui_url}/trending/graphs/view/${graph.config._cid.replace('/graph/', '')}`));
}

app.
    version(cosi.app_version).
    option('-l, --long', 'long listing').
    option('-q, --quiet', 'no header lines').
    parse(process.argv);

if (!app.quiet) {
    console.log(chalk.bold(app.name()), `v${app.version()}`);
}

const list = graphList();

if (list.length === 0) {
    console.error(chalk.red('No local graphs found'));
    process.exit(1);
}

let maxIdLen = 20;

for (const graph of list) {
    if (graph.id.length > maxIdLen) {
        maxIdLen = graph.id.length;
    }
}

if (!app.quiet && !app.long) {
    emitLine(maxIdLen);
}

for (const graph of list) {
    if (app.long) {
        emitLong(graph);
    } else {
        emitLine(
            maxIdLen,
            graph.id,
            graph.config.title || 'null',
            graph.config.description || 'null'
        );
    }
}

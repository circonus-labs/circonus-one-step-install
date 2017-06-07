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
const Fetch = require(path.join(cosi.lib_dir, 'template', 'fetch'));

app.
    version(cosi.app_version).
    option('--id <type-id>', 'template id, format type-id (e.g. check-system, graph-cpu, graph-vm, etc.)').
    option('--all', 'fetch all templates specific to this host configuration').
    option('--force', 'overwrite, if template already exists', false).
    option('-q, --quiet', 'no header lines').
    parse(process.argv);

if (!app.quiet) {
    console.log(chalk.bold(app.name()), `v${app.version()}`);
}

if (!app.id && !app.all) {
    console.error(chalk.red('One of, --id or --all is required.'));
    app.outputHelp();
    process.exit(1);
}

if (app.id && app.all) {
    console.error(chalk.red('Mutually exclusive, one of --id or --all, not both.'));
    app.outputHelp();
    process.exit(1);
}

if (app.id && !app.id.match(/^(check|graph)-.+$/)) {
    console.error(chalk.red(`Unrecognized template type in ID '${app.id}'`));
    process.exit(1);
}

if (app.config) {
    if (app.config.substr(0, 1) !== '/') {
        app.config = path.resolve(app.config);
    }
}

const fetch = new Fetch(
    cosi.cosi_url,
    cosi.agent_url,
    cosi.reg_dir,
    cosi.cosi_os_type,
    cosi.cosi_os_dist,
    cosi.cosi_os_vers,
    cosi.cosi_os_arch,
    cosi.statsd_type,
    app.force
);

if (app.id) {
    // fetch specific template
    const templateFile = path.resolve(path.join(cosi.reg_dir, `template-${app.id}.json`));

    try {
        const stat = fs.statSync(templateFile);

        if (stat.isFile() && !app.force) {
            console.log(chalk.yellow('Template exits'), `- use --force to overwrite. '${templateFile}'`);
            process.exit(0);
        }
    } catch (err) {
        if (err.code !== 'ENOENT') {
            throw err;
        }
    }

    fetch.template(
        app.id,
        (fetchError, template) => {
            if (fetchError) {
                if (fetchError.code === 404) {
                    console.error(chalk.red('Unknown Template ID'), app.id, 'not found.');
                    process.exit(1);
                } else {
                    console.error(fetchError);
                    throw fetchError;
                }
            }

            if (template.save(templateFile, app.force)) {
                if (!app.quiet) {
                    console.log('Saved template:', templateFile);
                }
            }
        }
    );
}

if (app.all) {
    fetch.all(app.quiet, (fetchError, result) => {
        if (!app.quiet) {
            console.log(result);
        }
        if (fetchError) {
            throw fetchError;
        }
    });
}

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
const api = require(path.resolve(cosi.lib_dir, 'api'));

const Check = require(path.resolve(path.join(cosi.lib_dir, 'check')));

/**
 * get cid for existing check
 * @arg {String} id of check
 * @returns {String} cid of check
 */
function getCid(id) {
    const cfgName = path.resolve(path.join(cosi.reg_dir, `registration-${id}.json`));
    const check = new Check(cfgName);

    return check._cid;
}

app.
    version(cosi.app_version).
    option('-i, --id <id>', "check ID, see 'cosi check list'. or a check_bundle id from UI").
    option('-k, --check <type>', 'check type [system]').
    option('-n, --display_name <name>', 'check name to fetch').
    option('-t, --target_host <target>', 'check target host (IP|FQDN) to fetch').
    option('-s, --save <file>', 'save fetched check to file').
    parse(process.argv);

console.error(chalk.bold(app.name()), `v${app.version()}`);

let checkType = app.check;

if (checkType) {
    checkType = app.check.toLowerCase();
} else {
    checkType = 'system';
}

let circonusCheckType = checkType;

if (checkType === 'system') {
    circonusCheckType = cosi.agent_mode.toLowerCase() === 'push' ? 'httptrap' : 'json:nad';
}

let urlPath = '/check_bundle';
let search = `(active:1)(type:"${circonusCheckType}")`;

if (app.display_name) {
    const tmp = `${app.display_name} ${search}`;

    search = tmp;
}

if (app.target_host) {
    search += `(host:"${app.target_host}")`;
}

if (app.id) {
    if (app.id.match(/^[0-9]+$/)) {
        urlPath += `/${app.id}`;
    } else {
        urlPath = getCid(app.id);
    }
    search = null;
} else {
    urlPath += `?search=${search}`;
}

api.get(urlPath, null).
    then((res) => {
        const parsed_body = res.parsed_body;
        const code = res.code;
        const raw_body = res.raw_body;

        if (code !== 200) {
            const err = new Error('Fetching check');

            err.code = code;
            err.parsed_body = parsed_body;
            err.raw_body = raw_body;

            console.error(chalk.red('ERROR'), err);
            process.exit(1);
        }

        if (parsed_body === null) {
            console.error(chalk.red(`No ${checkType} checks found for ${search}.`));
            process.exit(1);
        }

        if (Array.isArray(parsed_body)) {
            if (parsed_body.length === 0) {
                console.error(chalk.red(`No ${checkType} checks found for ${search}.`));
                process.exit(1);
            }

            if (parsed_body.length > 1) {
                console.log(chalk.yellow('WARN'), `multiple checks found matching ${search}`);
                for (const check of parsed_body) {
                    console.log('-----');
                    console.log(chalk.bold('ID:'), check._cid.replace('/check_bundle/', ''));
                    console.log(chalk.bold('Name:'), check.display_name);
                    console.log(chalk.bold('Type:'), check.type);
                    console.log(chalk.bold('Target:'), check.target);
                    console.log();
                }
                process.exit(0);
            }
        }

        if (app.save) {
            const file = path.resolve(app.save);

            fs.writeFileSync(file, JSON.stringify(parsed_body, null, 4));
            console.log(chalk.green('Saved'), `check configuration to ${file}`);
        } else {
            console.dir(parsed_body);
        }
    }).
    catch((err) => {
        console.error(chalk.red('ERROR'), err);
        process.exit(1);
    });

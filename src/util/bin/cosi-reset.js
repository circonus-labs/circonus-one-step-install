#!/usr/bin/env node

// Copyright 2016 Circonus, Inc. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

/**
 * COSI reset
 *
 * remove COSI checks, graphs, and worksheets
 *
 * use api to delete in circonus
 * remove local registration file
 * remove local config file
 * remove local template file
 *
 */

'use strict';

const path = require('path');
const fs = require('fs');
const Events = require('events').EventEmitter;
const child = require('child_process');

const app = require('commander');
const chalk = require('chalk');

const cosi = require(path.resolve(path.join(__dirname, '..', 'lib', 'cosi')));
const api = require(path.resolve(cosi.lib_dir, 'api'));

/**
 * delete a specific item
 * @arg {Object} item definition
 * @arg {Boolean} keepTemplates flag
 * @arg {Function} cb callback
 * @returns {Undefined} nothing
 */
function deleteItem(item, keepTemplates, cb) {
    let cfg = {};

    try {
        cfg = require(item.regFile); // eslint-disable-line global-require
    } catch (err) {
        if (err.code === 'MODULE_NOT_FOUND') {
            console.log(chalk.yellow('WARN'), 'Registration not found', item.regFile);

            cb(null);

            return;
        }

        cb(err);

        return;
    }

    const itemURL = cfg._cid;
    const itemName = cfg.display_name || cfg.title || cfg.description || '';

    const cleaner = () => {
        try {
            console.log(`\tremoving ${item.regFile}`);
            fs.unlinkSync(item.regFile);
        } catch (err) {
            return err;
        }

        if (item.cfgFile !== null) {
            try {
                console.log(`\tremoving ${item.cfgFile}`);
                fs.unlinkSync(item.cfgFile);
            } catch (err) {
                return err;
            }
        }

        if (item.templateFile !== null) {
            if (keepTemplates) {
                console.log(`\tKEEPING ${item.templateFile}`);
            } else {
                try {
                    console.log(`\tremoving ${item.templateFile}`);
                    fs.unlinkSync(item.templateFile);
                } catch (err) {
                    // graph templates can have mulitple graphs, ignore any missing files
                    if (err.code !== 'ENOENT') {
                        return err;
                    }
                }
            }
        }

        return null;
    };

    console.log(chalk.bold('Checking'), `${itemName} ${itemURL}`);
    api.get(itemURL, null).
        then((res) => {
            if (res.code === 404 && (res.raw_body && res.raw_body.indexOf('requested object was not found') !== -1)) {
                console.log(`\t${itemURL}`, chalk.bold('not found'), '- cleaning up orphaned files.');
                cb(cleaner());

                return;
            }

            if (res.code < 200 || res.code > 299) {
                console.error(chalk.red('API RESULT CODE'), res.code, res.parsed_body);
                cb(res.parsed_body);

                return;
            }

            console.log(chalk.bold('\tDeleting'), `${itemName} ${itemURL}`);

            api.delete(itemURL).
                then((res2) => {
                    if (res2.code < 200 || res2.code > 299) {
                        console.error(chalk.red('API RESULT CODE'), res2.code, res2.parsed_body);
                        cb(res2.parsed_body);

                        return;
                    }

                    cb(cleaner());
                }).
                catch((err) => {
                    console.error(chalk.red('API ERROR'), err);
                    console.error('Attempt to run the command again. Contact support if the error persists.');
                    process.exit(1);
                });
        }).
        catch((err) => {
            if ({}.hasOwnProperty.call(err, 'raw_body') && err.raw_body.indexOf('requested object was not found') !== -1) {
                console.log(`\t${itemURL}`, chalk.bold('not found'), '- cleaning up orphaned files.');
                cb(cleaner());

                return;
            }
            console.error(chalk.red('ERROR'), 'An API error occurred', err);
            cb(err);
        });
}


/**
 * find asset registrations
 * @arg {String} dir to search
 * @arg {String} itemType to search for
 * @arg {String} itemId of specific asset
 * @returns {Array} list of items
 */
function findItems(dir, itemType, itemId) {
    let id = null;

    if (typeof itemId === 'string') {
        id = itemId;
        if (id.substring(0, itemType.length + 1) !== `${itemType}-`) {
            id = `${itemType}-${id}`;
        }
        id = `registration-${id}`;
    } else {
        id = `registration-${itemType}-`;
    }

    const re = new RegExp(`^${id}.*`);

    let files = null;

    try {
        files = fs.readdirSync(dir);
    } catch (err) {
        throw err;
    }

    const entries = [];

    for (const file of files) {
        if (itemType === 'check' && typeof itemId === 'undefined') {
            // don't remove the group check unless it is explicitly
            // specified on the command line. (--check=group).
            // there is no way to know how many other systems
            // still be depend on the check.
            if (file.includes('-group')) {
                continue;
            }
        }

        if (file.match(re)) {
            const regFile = path.resolve(path.join(dir, file));
            const cfgFile = regFile.replace('registration-', 'config-');
            let templateFile = regFile.replace('registration-', 'template-');

            if (file.match('registration-graph')) {
                const parts = file.split('-');

                if (parts) {
                    templateFile = path.resolve(path.join(dir, `template-graph-${parts[2]}.json`));
                }
            }

            entries.push({
                cfgFile,
                regFile,
                templateFile
            });
        }
    }

    console.log(`Found ${entries.length} ${itemType}s.`);

    return entries;
}

/**
 * remove configuration files
 * @arg {Function} cb callback
 * @returns {Undefined} nothing
 */
function removeConfigs(cb) {
    console.log('Removing COSI configuration files');

    if (cosi.agent_mode === 'reverse') {
        console.log(`\tre-installing default NAD config`);
        try {
            child.execSync(path.resolve(path.join(cosi.cosi_dir, 'bin', 'nadreverse_uninstall.sh')));
        } catch (err) {
            console.dir(err);
        }
    }

    const configFiles = [
        path.resolve(path.join(cosi.etc_dir, 'cosi.json')),
        path.resolve(path.join(cosi.etc_dir, 'circonus-nadreversesh')),
        path.resolve(path.join(cosi.etc_dir, 'statsd.json')),
        path.resolve(path.join(cosi.cosi_dir, '..', 'etc', 'circonus-nadpush.json')),
        path.resolve(path.join(cosi.nad_etc_dir, 'pg-conf.sh')),
        path.resolve(path.join(cosi.nad_etc_dir, 'pg-po-conf.sh')),
        path.resolve(path.join(cosi.reg_dir, 'setup-config.json')),
        path.resolve(path.join(cosi.reg_dir, 'setup-metrics.json'))
    ];

    for (let i = 0; i < configFiles.length; i++) {
        const file = configFiles[i];

        try {
            console.log(`\tremoving ${file}`);
            fs.unlinkSync(file);
        } catch (unlinkErr) {
            // ignore any files which are missing (some are --agent type specific)
            if (unlinkErr.code !== 'ENOENT') {
                console.error(chalk('red'), unlinkErr);
            }
        }
    }

    cb();
}

app.
    version(cosi.app_version).
    option('-a, --all', 'Delete all COSI checks, graphs, and worksheets for this host').
    option('-c, --check [id]', 'Delete COSI check with [id] or all checks for this host').
    option('-g, --graph [id]', 'Delete COSI graph with [id] or all graphs for this host').
    option('-d, --dashboard [id]', 'Delete COSI dashboard with [id] or all dashboards for this host').
    option('-w, --worksheet [id]', 'Delete COSI worksheet with [id] or all worksheets for this host').
    option('-r, --ruleset [id]', 'Delete COSI ruleset with [id] or all rulesets').
    option('--notemplate', 'Keep template files, do not remove with registration and config files.').
    option('--configs', 'Remove the COSI configuration files. Combine with --all for a re-install.').
    option('-q, --quiet', 'Only error output').
    parse(process.argv);

// main

const items = [];

if (app.all || app.worksheet) {
    items.push.apply(items, findItems(cosi.reg_dir, 'worksheet', app.worksheet));
}

if (app.all || app.graph) {
    items.push.apply(items, findItems(cosi.reg_dir, 'graph', app.graph));
}

if (app.all || app.dashboard) {
    items.push.apply(items, findItems(cosi.reg_dir, 'dashboard', app.dashboard));
}


if (app.all || app.ruleset) {
    let files = [];

    try {
        files = fs.readdirSync(cosi.ruleset_dir);
    } catch (err) {
        console.error(chalk.yellow('WARN'), 'reading ruleset directory', err);
    }

    for (const file of files) {
        const cfgFile = null;
        const templateFile = null;
        let regFile = null;

        if (file.indexOf('-cosi.json') !== -1) {
            regFile = path.resolve(path.join(cosi.ruleset_dir, file));
            if (app.ruleset && file.indexOf(app.ruleset) === -1) {
                regFile = null;
            }
        }

        if (regFile !== null) {
            items.push({
                cfgFile,
                regFile,
                templateFile
            });
        }
    }
}

// always do checks last, remove everything dependent on the check(s) first
if (app.all || app.check) {
    items.push.apply(items, findItems(cosi.reg_dir, 'check', app.check));
}

if (items.length > 0) {
    const events = new Events();

    events.on('next', () => {
        const item = items.shift();

        if (typeof item === 'undefined') {
            events.emit('done');

            return;
        }

        deleteItem(item, app.notemplate, (err) => {
            if (err) {
                console.error(chalk.red('ERROR'), 'deleting item', item, err);
                process.exit(1);
            }
            events.emit('next');
        });
    });

    events.on('done', () => {
        if (app.configs) {
            removeConfigs(() => {
                console.log('reset complete');
            });
        } else {
            console.log('reset complete');
        }
    });

    events.emit('next');
} else if (app.configs) {
    removeConfigs(() => {
        console.log('configs removed');
    });
}


// END

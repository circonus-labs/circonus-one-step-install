#!/usr/bin/env node

/*eslint-env node, es6 */
/*eslint-disable no-warning-comments, no-process-exit, no-magic-numbers, global-require */

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

"use strict";

const path = require("path");
const fs = require("fs");
const Events = require("events").EventEmitter;

const app = require("commander");
const api = require("circonusapi2");
const chalk = require("chalk");

const cosi = require(path.resolve(path.join(__dirname, "..", "lib", "cosi")));

function deleteItem(item, keepTemplates, cb) { //eslint-disable-line consistent-return
    let cfg = {};

    try {
        cfg = require(item.regFile);
    }
    catch (err) {
        if (err.code === "MODULE_NOT_FOUND") {
            console.log(chalk.yellow("WARN"), "Registration not found", item.regFile);
            return cb(null);
        }
        return cb(err);
    }

    const itemURL = cfg._cid;
    const itemName = cfg.display_name || cfg.title || cfg.description || cfg.regFile;

    console.log(chalk.bold("Deleting"), `${itemName} ${itemURL}`);

    api.delete(itemURL, (code, apiError, result) => {
        if (apiError) {
            console.error(chalk.red("API ERROR"), `API ${code}`, apiError, result);
            console.error("Attempt to run the command again. Contact support if the error persists.");
            process.exit(1);
        }

        if (code < 200 || code > 299) { //eslint-disable-line no-magic-numbers
            console.error(chalk.red("API RESULT CODE"), `API ${code}`, apiError, result);
            return cb(apiError);
        }

        console.log(`\tremoving ${item.regFile}`);
        fs.unlinkSync(item.regFile);

        console.log(`\tremoving ${item.cfgFile}`);
        fs.unlinkSync(item.cfgFile);

        if (item.templateFile !== null) {
            if (keepTemplates) {
                console.log(`\tKEEPING ${item.templateFile}`);
            }
            else {
                try {
                    console.log(`\tremoving ${item.templateFile}`);
                    fs.unlinkSync(item.templateFile);
                }
                catch (err) {
                    // graph templates can have mulitple graphs, ignore any missing files
                    if (err.code !== "ENOENT") {
                        return cb(err);
                    }
                }
            }
        }

        return cb(null);
    });
}


function findItems(dir, itemType, itemId) {
    let id = null;

    if (typeof itemId === "string") {
        id = itemId;
        if (id.substring(0, itemType.length + 1) !== `${itemType}-`) {
            id = `${itemType}-${id}`;
        }
        id = `registration-${id}`;
    }
    else {
        id = `registration-${itemType}-`;
    }

    const re = new RegExp(`^${id}.*`);

    let files = null;

    try {
        files = fs.readdirSync(dir);
    }
    catch (err) {
        throw err;
    }

    const entries = [];

    // for (const file of files) {
    for (let i = 0; i < files.length; i++) {
        const file = files[i];

        if (file.match(re)) {
            const regFile = path.resolve(path.join(dir, file));
            const cfgFile = regFile.replace("registration-", "config-");
            let templateFile = regFile.replace("registration-", "template-");

            if (file.match("registration-graph")) {
                const parts = file.split("-");

                if (parts) {
                    templateFile = path.resolve(path.join(dir, `template-graph-${parts[2]}.json`));
                }
            }

            entries.push({
                regFile,
                cfgFile,
                templateFile
            });
        }
    }

    console.log(`Found ${entries.length} ${itemType}s.`);
    return entries;
}


app.
    version(cosi.app_version).
    option("-a, --all", "Delete all COSI checks, graphs, and worksheets for this host").
    option("-c, --check [id]", "Delete COSI check with [id] or all checks for this host").
    option("-g, --graph [id]", "Delete COSI graph with [id] or all graphs for this host").
    option("-w, --worksheet [id]", "Delete COSI worksheet with [id] or all worksheets for this host").
    option("--notemplate", "Keep template files, do not remove with registration and config files.").
    option("-q, --quiet", "Only error output").
    parse(process.argv);

//// main

if (!app.all && !app.check && !app.graph && !app.worksheet) {
    console.error(chalk.red("No option(s) provided, at least one (-c, -g, -w, or -a) is required."));
    app.help();
}

api.setup(cosi.api_key, cosi.api_app, cosi.api_url);

const items = [];

if (app.all || app.worksheet) {
    items.push.apply(items, findItems(cosi.reg_dir, "worksheet", app.worksheet));
}

if (app.all || app.graph) {
    items.push.apply(items, findItems(cosi.reg_dir, "graph", app.graph));
}

if (app.all || app.check) {
    items.push.apply(items, findItems(cosi.reg_dir, "check", app.check));
}

if (items.length > 0) {
    const events = new Events();

    events.on("next", () => {
        const item = items.shift();

        if (typeof item === "undefined") {
            events.emit("done");
            return;
        }

        deleteItem(item, app.notemplate, (err) => {
            if (err) {
                console.dir(err);
                throw err;
            }
            events.emit("next");
        });
    });

    events.on("done", () => {
        console.log("reset complete");
    });

    events.emit("next");
}

// END

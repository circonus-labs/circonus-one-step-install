#!/usr/bin/env node

/*eslint-env node, es6 */
/*eslint-disable no-magic-numbers */

"use strict";

const path = require("path");
const fs = require("fs");

const app = require("commander");
const chalk = require("chalk");

const cosi = require(path.resolve(path.join(__dirname, "..", "lib", "cosi")));

const Settings = require(path.join(cosi.libDir, "settings"));
const Fetch = require(path.join(cosi.libDir, "template", "fetch"));

const settings = new Settings(app.config);

app.
    version(cosi.version).
    option("--id <type-id>", "template id, format type-id (e.g. check-system, graph-cpu, graph-vm, etc.)").
    option("--all", "fetch all templates specific to this host configuration").
    option("--force", "overwrite, if template already exists", false).
    option("-q, --quiet", "no header lines").
    parse(process.argv);

if (!app.quiet) {
    console.log(chalk.bold(app.name()), `v${app.version()}`);
}

if (!app.id && !app.all) {
    console.error(chalk.red("One of, --id or --all is required."));
    app.outputHelp();
    process.exit(1); //eslint-disable-line no-process-exit
}

if (app.id && app.all) {
    console.error(chalk.red("Mutually exclusive, one of --id or --all, not both."));
    app.outputHelp();
    process.exit(1); //eslint-disable-line no-process-exit
}

if (app.id && !app.id.match(/^(check|graph)\-.+$/)) {
    console.error(chalk.red(`Unrecognized template type in ID '${app.id}'`));
    process.exit(1); //eslint-disable-line no-process-exit
}

if (app.config) {
    if (app.config.substr(0, 1) !== "/") {
        app.config = path.resolve(app.config);
    }
}

const fetch = new Fetch(
    settings.cosi_url,
    settings.agent_url,
    settings.reg_dir,
    settings.cosi_os_type,
    settings.cosi_os_dist,
    settings.cosi_os_vers,
    settings.cosi_os_arch,
    settings.statsd_type,
    app.force
);

if (app.id) {
    // fetch specific template
    const templateFile = path.resolve(path.join(settings.reg_dir, `template-${app.id}.json`));

    try {
        const stat = fs.statSync(templateFile);

        if (stat.isFile() && !app.force) {
            console.log(chalk.yellow("Template exits"), `- use --force to overwrite. '${templateFile}'`);
            process.exit(0); //eslint-disable-line no-process-exit
        }
    } catch (err) {
        if (err.code !== "ENOENT") {
            throw err;
        }
    }

    fetch.template(app.id,
        (fetchError, template) => {
            if (fetchError) {
                console.error(fetchError);
                throw fetchError;
            }

            if (template.saveFile(templateFile, app.force)) {
                if (!app.quiet) {
                    console.log("Saved template:", templateFile);
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

#!/usr/bin/env node

/*eslint-env node, es6 */
/*eslint-disable no-process-exit */
/*eslint-disable no-magic-numbers */

"use strict";

const path = require("path");

const app = require("commander");
const chalk = require("chalk");

const cosi = require(path.resolve(path.join(__dirname, "..", "lib", "cosi")));
const Postgres = require(path.resolve(path.join(cosi.lib_dir, "plugins", "postgres")));

app.
    version(cosi.app_version).
    option("-e, --enable", "enable the postgres plugin").
    option("-d, --disable", "disable the postgres plugin").
    option("-b, --pgdb [database]", "the postgres database name to enable", "postgres").
    option("-u, --pguser [user]", "the postgres user to run as", "postgres").
    option("-a, --pgpass [pass]", "the pass of the postgres user", "").
    option("-o, --pgport [port]", "port to connect to", 5432).
    option("-q, --quiet", "less output").
    parse(process.argv);

if (!app.quiet) {
    console.log(chalk.bold(app.name()), `v${app.version()}`);
}

if (app.enable && app.disable) {
    console.error(chalk.red("ERROR"), "enable and disable are mutually exclusive");
    process.exit(1);
}

if (!app.enable && !app.disable) {
    console.error(chalk.red("ERROR"), "must specify enable or disable");
    process.exit(1);
}

const plugin = new Postgres(app);

plugin.once("plugin.done", (err) => {
    if (err !== null) {
        console.error(chalk.red("ERROR"), err);
        process.exit(1);
    }
    console.log(chalk.blue("SUCCESS"), "PostgreSQL plugin was", app.enable ? "enabled" : "disabled");
});

if (app.enable) {
    plugin.enable();
}
else {
    plugin.disable();
}

// END

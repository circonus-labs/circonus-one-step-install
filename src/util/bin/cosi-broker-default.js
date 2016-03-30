#!/usr/bin/env node

/*eslint-env node, es6 */
/*eslint-disable no-magic-numbers */

"use strict";

const path = require("path");

const app = require("commander");
const chalk = require("chalk");

const cosi = require(path.resolve(path.join(__dirname, "..", "lib", "cosi")));
const Broker = require(path.join(cosi.lib_dir, "broker"));

app.
    version(cosi.app_version).
    option("-q, --quiet", "no header lines. '|' delimited, parsable output.").
    parse(process.argv);

if (!app.quiet) {
    console.log(chalk.bold(app.name()), `v${app.version()}`);
}

const broker = new Broker(app.quiet);

broker.getDefaultBroker((err, defaultBroker) => {
    if (err) {
        console.dir(err);
        throw err;
    }

    console.log(cosi.cosi_os_type, cosi.cosi_os_dist, `v${cosi.cosi_os_vers}`, cosi.cosi_os_arch, cosi.agent_mode, "agent mode.");
    console.log(chalk.bold("Default broker:"), defaultBroker._cid.replace("/broker/", ""), "-", defaultBroker._name);

});

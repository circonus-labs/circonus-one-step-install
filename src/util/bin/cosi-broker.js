#!/usr/bin/env node

/*eslint-env node, es6 */
/*eslint-disable no-magic-numbers */

"use strict";

const path = require("path");

const app = require("commander");

const cosi = require(path.resolve(path.join(__dirname, "..", "lib", "cosi")));

app.
    version(cosi.app_version).
    command("default", "show default broker").
    command("list", "list available brokers").
    command("show", "show information about a specific broker").
    parse(process.argv);

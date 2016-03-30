#!/usr/bin/env node

/*eslint-env node, es6 */
/*eslint-disable no-magic-numbers */

"use strict";

const path = require("path");

const app = require("commander");

const cosi = require(path.resolve(path.join(__dirname, "..", "lib", "cosi")));

app.
    version(cosi.app_version).
    command("create", "create a check using a local config").
    // command("delete", "delete a check from a local registration configuration").
    command("fetch", "fetch checks for host using Circonus API").
    command("list", "list local checks for host").
    command("update", "update a check using a modified local config").
    parse(process.argv);

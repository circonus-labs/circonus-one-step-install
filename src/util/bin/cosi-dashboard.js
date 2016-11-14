#!/usr/bin/env node

/*eslint-env node, es6 */
/*eslint-disable no-magic-numbers */

"use strict";

const path = require("path");

const app = require("commander");

const cosi = require(path.resolve(path.join(__dirname, "..", "lib", "cosi")));

app.
    version(cosi.version).
    command("create", "create a dashboard using a local config").
    command("list", "list local dashboards for host").
    command("update", "update a dashboard using a modified local config").
    parse(process.argv);

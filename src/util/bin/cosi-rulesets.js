#!/usr/bin/env node

/*eslint-env node, es6 */
/*eslint-disable no-magic-numbers */

"use strict";

const path = require("path");

const app = require("commander");

const cosi = require(path.resolve(path.join(__dirname, "..", "lib", "cosi")));

app.
    version(cosi.version).
    command("create", "create a rulesets using a local config").
    command("delete", "delete local ruleset(s) for host").
    command("list", "list local rulesets for host").
    parse(process.argv);

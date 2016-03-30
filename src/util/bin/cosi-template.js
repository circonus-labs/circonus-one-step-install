#!/usr/bin/env node

/*eslint-env node, es6 */
/*eslint-disable no-magic-numbers */

"use strict";

const path = require("path");

const app = require("commander");

const cosi = require(path.resolve(path.join(__dirname, "..", "lib", "cosi")));

app.
    version(cosi.version).
    command("fetch", "fetch default templates from COSI site").
    command("list", "list local templates for check(s)/graph(s)").
    parse(process.argv);

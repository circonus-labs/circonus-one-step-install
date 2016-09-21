#!/usr/bin/env node

/*eslint-env node, es6 */
/*eslint-disable no-magic-numbers */

"use strict";

const path = require("path");

const app = require("commander");

const cosi = require(path.resolve(path.join(__dirname, "..", "lib", "cosi")));

app.
    version(cosi.app_version).
    command("postgres", "Manage PostgreSQL plugin").
    option("-q, --quiet", "less output").
    parse(process.argv);

// END

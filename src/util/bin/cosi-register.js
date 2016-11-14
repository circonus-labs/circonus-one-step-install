#!/usr/bin/env node

/* eslint-env node, es6 */
/* eslint-disable no-magic-numbers */

'use strict';

const path = require('path');

const app = require('commander');

const cosi = require(path.resolve(path.join(__dirname, '..', 'lib', 'cosi')));

const Registration = require(path.join(cosi.lib_dir, 'registration', 'register'));

app.
    version(cosi.app_version).
    option('-q, --quiet', 'only error output').
    parse(process.argv);

const registration = new Registration(app.quiet);

registration.register();

// END

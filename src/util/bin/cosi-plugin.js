#!/usr/bin/env node

/* eslint-env node, es6 */

'use strict';

const path = require('path');

const app = require('commander');

const cosi = require(path.resolve(path.join(__dirname, '..', 'lib', 'cosi')));

app.
    version(cosi.app_version).
    command('cassandra', 'Manage Cassandra plugin').
    command('postgres', 'Manage PostgreSQL plugin').
    parse(process.argv);

// END

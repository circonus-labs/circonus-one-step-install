#!/usr/bin/env node

// Copyright 2016 Circonus, Inc. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

'use strict';

const path = require('path');

const app = require('commander');

const cosi = require(path.resolve(path.join(__dirname, '..', 'lib', 'cosi')));

app.
    version(cosi.app_version).
    command('fetch', 'fetch default templates from COSI site').
    command('list', 'list local templates for check(s)/graph(s)').
    parse(process.argv);

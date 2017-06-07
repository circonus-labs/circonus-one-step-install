#!/usr/bin/env node

// Copyright 2016 Circonus, Inc. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

'use strict';

const path = require('path');

const app = require('commander');

const cosi = require(path.resolve(path.join(__dirname, '..', 'lib', 'cosi')));

app.
    version(cosi.version).
    command('create', 'create a worksheet using a local config').
    command('list', 'list local worksheets for host').
    command('update', 'update a worksheet using a modified local config').
    parse(process.argv);

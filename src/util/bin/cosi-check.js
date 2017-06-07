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
    command('create', 'create a check using a local config').
    // command("delete", "delete a check from a local registration configuration").
    command('fetch', 'fetch checks for host using Circonus API').
    command('list', 'list local checks for host').
    command('update', 'update a check using a modified local config').
    parse(process.argv);

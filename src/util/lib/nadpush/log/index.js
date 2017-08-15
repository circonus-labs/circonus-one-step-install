// Copyright 2016 Circonus, Inc. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

'use strict';

module.exports.info = (msg) => {
    const dte = new Date();

    console.log(`${dte.toISOString()} INFO ${msg}`);
};

module.exports.warn = (msg) => {
    const dte = new Date();

    console.warn(`${dte.toISOString()} WARN ${msg}`);
};

module.exports.error = (msg) => {
    const dte = new Date();

    console.error(`${dte.toISOString()} ERROR ${msg}`);
};

// END

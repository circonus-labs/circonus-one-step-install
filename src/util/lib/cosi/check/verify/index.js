// Copyright 2016 Circonus, Inc. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

'use strict';

const assert = require('assert');
const path = require('path');

const cosi = require(path.resolve(path.join(__dirname, '..', '..')));
const api = require(path.resolve(cosi.lib_dir, 'api'));
const Check = require(path.resolve(path.join(cosi.lib_dir, 'check')));

/**
 * verify that a local check reflects what the API returns
 * @arg {Object} localCheck object
 * @arg {Function} cb callback
 * @returns {Undefined} nothing, uses callback
 */
function verify(localCheck, cb) {
    assert.strictEqual(typeof localCheck, 'object', 'check is not an object');
    assert(localCheck instanceof Check, 'localCheck is not a Check');
    assert.strictEqual(typeof cb, 'function', 'cb must be a callback function');

    api.setup(cosi.api_key, cosi.api_app, cosi.api_url);
    api.get(localCheck._cid, null, (code, err, remoteCheck) => {
        if (err) {
            console.log('verify api call', remoteCheck);
            cb(err);

            return;
        }

        if (code !== 200) {
            console.log('verify api call, non 200 return', code, remoteCheck);
            cb(new Error('verify circonus api call non-200 response code'));

            return;
        }

        if (remoteCheck._last_modified !== localCheck._last_modified) {
            cb(null, false); // doh! check has been modified in UI

            return;
        }

        cb(null, true); // verified!
    });
}

module.exports = verify;

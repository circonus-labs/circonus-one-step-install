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
 * @returns {Promise} fetch remote check, compare to provided check
 */
function verify(localCheck) {
    assert.strictEqual(typeof localCheck, 'object', 'check is not an object');
    assert(localCheck instanceof Check, 'localCheck is not a Check');

    return new Promise((resolve, reject) => {
        api.get(localCheck._cid, null).
            then((res) => {
                if (res.code !== 200) {
                    const err = new Error();

                    err.code = res.code;
                    err.message = 'UNEXPECTED_API_RETURN';
                    err.body = res.parsed_body;
                    err.raw_body = res.raw_body;

                    reject(err);

                    return;
                }

                resolve(res.parsed_body._last_modified === localCheck._last_modified);
            }).
            catch((err) => {
                reject(err);
            });
    });
}

module.exports = verify;

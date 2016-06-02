"use strict";

/*eslint-env node, es6 */
/*eslint-disable no-magic-numbers */

const assert = require("assert");
const path = require("path");

const cosi = require(path.resolve(path.join(__dirname, "..", "..")));
const api = require(path.resolve(cosi.lib_dir, "api"));
const Check = require(path.resolve(path.join(cosi.lib_dir, "check")));

function verify(localCheck, cb) {
    assert.strictEqual(typeof localCheck, "object", "check is not an object");
    assert(localCheck instanceof Check, "localCheck is not a Check");
    assert.strictEqual(typeof cb, "function", "cb must be a callback function");

    api.setup(cosi.api_key, cosi.api_app, cosi.api_url);
    api.get(localCheck._cid, null, (code, err, remoteCheck) => {
        if (err) {
            console.log("verify api call", remoteCheck);
            return cb(err);
        }

        if (code !== 200) {
            console.log("verify api call, non 200 return", code, remoteCheck);
            return cb(new Error("verify circonus api call non-200 response code"));
        }

        if (remoteCheck._last_modified !== localCheck._last_modified) {
            return cb(null, false); // doh! check has been modified in UI
        }

        return cb(null, true); // verified!
    });
}

module.exports = verify;

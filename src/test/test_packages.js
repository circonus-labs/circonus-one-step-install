/*eslint-env node, es6 */
/*eslint-disable no-magic-numbers */

"use strict";

// core modules
const path = require("path");

// local modules
const test = require("tape");

// test module
const packages = require(path.normalize(path.join(__dirname, "..", "lib", "packages")));

test("Package list", (t) => {
    const id = Date.now().toString();
    const ok_dist = "CentOS";
    const ok_vers = "7.1.1503";
    let err = null;

    t.notOk(packages.isSupported(id, null, null), "os should NOT be supported");
    err = packages.getError(id, null, null);
    t.equal(err.message, `OS Distribution ${id} not supported`);

    t.notOk(packages.isSupported(ok_dist, id, null), "os vers should NOT be supported");
    err = packages.getError(ok_dist, id, null);
    t.equal(err.message, `Version ${id} of ${ok_dist} not supported`);

    t.notOk(packages.isSupported(ok_dist, ok_vers, id), "os arch should NOT be supported");
    err = packages.getError(ok_dist, ok_vers, id);
    t.equal(err.message, `${id} of ${ok_dist} v${ok_vers} not supported`);

    const supported = packages.supportedList();

    t.ok(Array.isArray(supported), "supported list should be array");

    for (let i = 0; i < supported.length; i++) {
        const os = supported[i].split(/ /);

        t.ok(Array.isArray(os), "os info should be array");
        t.equal(os.length, 3);
        t.ok(packages.isSupported(os[0], os[1], os[2]), `${os} should be supported`);
    }

    t.end();

});

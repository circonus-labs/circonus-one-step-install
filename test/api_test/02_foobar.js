/*eslint-env node, es6 */
/*eslint-disable no-process-exit */

"use strict";

// core modules
const http = require("http");

// local modules
const test = require("tape");

test("API /foobar (not found)", function(t) {

    http.get("http://127.0.0.1/foobar", (res) => {
        let res_data = "";

        res.on("data", (chunk) => {
            res_data += chunk;
        });

        res.on("end", () => {
            t.equal(res.statusCode, 404);
        });

    }).on("error", (err) => {
        throw err;
    });

    t.plan(1);

});

/*eslint-env node, es6 */
/*eslint-disable no-process-exit */

"use strict";

// core modules
const http = require("http");

// local modules
const test = require("tape");

test("API /", function(t) {

    http.get("http://127.0.0.1/", (res) => {
        let res_data = "";

        res.on("data", (chunk) => {
            res_data += chunk;
        });

        res.on("end", () => {

            t.equal(res.statusCode, 200);
            t.ok(res.headers.hasOwnProperty("content-type"), "has content-type header");
            t.equal(res.headers["content-type"], "application/json");

            const parsed_data = JSON.parse(res_data);

            t.ok(parsed_data.hasOwnProperty("description"), "has description");
            t.ok(parsed_data.hasOwnProperty("version"), "has version");
            t.ok(parsed_data.hasOwnProperty("supported"), "has supported");
            t.ok(Array.isArray(parsed_data.supported), "supported is array");
            t.ok(parsed_data.supported.length > 0, "supported length > 0");

        });

    }).on("error", (err) => {
        throw err;
    });

    t.plan(8);

});

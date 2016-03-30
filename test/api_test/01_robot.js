/*eslint-env node, es6 */
/*eslint-disable no-process-exit */

"use strict";

// core modules
const http = require("http");

// local modules
const test = require("tape");

test("API /robots.txt", function(t) {

    http.get("http://127.0.0.1/robots.txt", (res) => {
        let res_data = "";

        res.on("data", (chunk) => {
            res_data += chunk;
        });

        res.on("end", () => {

            t.equal(res.statusCode, 200);
            t.ok(res.headers.hasOwnProperty("content-type"), "has content-type header");
            t.equal(res.headers["content-type"], "text/plain");

            t.notEqual(res_data.indexOf("User-agent: *"), -1);
            t.notEqual(res_data.indexOf("Disallow: /"), -1);
        });

    }).on("error", (err) => {
        throw err;
    });

    t.plan(5);

});

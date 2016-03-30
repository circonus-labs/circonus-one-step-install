/*eslint-env node, es6 */
/*eslint-disable no-process-exit */

"use strict";

// core modules
const http = require("http");
const url = require("url");

// local modules
const test = require("tape");

const id = Date.now().toString();

function makeValidRequest() {
    return {
        "type": "Linux-gnu",
        "dist": "CentOS",
        "vers": "7.1.1503",
        "arch": "x86_64"
    };
}

test("API /templates (no param)", function(t) {
    const req_obj = url.parse("http://127.0.0.1/templates");

    http.get(url.format(req_obj), (res) => {
        let res_data = "";

        res.on("data", (chunk) => {
            res_data += chunk;
        });

        res.on("end", () => {
            console.log(res_data);

            t.equal(res.statusCode, 409);

            const parsed_data = JSON.parse(res_data);

            t.ok(parsed_data.hasOwnProperty("message"), "has message property");

            const msg = parsed_data.message.split(", ");

            t.equal(msg.length, 5);
            t.notEqual(msg[0].indexOf("type"), -1);
            t.notEqual(msg[1].indexOf("dist"), -1);
            t.notEqual(msg[2].indexOf("vers"), -1);
            t.notEqual(msg[3].indexOf("arch"), -1);
            t.notEqual(msg[4].indexOf("ref id"), -1);

        });

    }).on("error", (err) => {
        throw err;
    });

    t.plan(8);

});

test("API /templates (valid)", function(t) {
    const req_obj = url.parse("http://127.0.0.1/templates");
    let req_args = makeValidRequest();

    req_obj.query = req_args;

    console.log(url.format(req_obj));

    http.get(url.format(req_obj), (res) => {
        let res_data = "";

        res.on("data", (chunk) => {
            res_data += chunk;
        });

        res.on("end", () => {
            console.log(res_data);
            t.equal(res.statusCode, 200);

            const parsed_data = JSON.parse(res_data);

            t.ok(parsed_data.hasOwnProperty("templates"), "has templates property");
            t.ok(Array.isArray(parsed_data.templates), "templates is array");
            t.ok(parsed_data.templates.length > 0, "templates length > 0");

        });

    }).on("error", (err) => {
        throw err;
    });

    t.plan(4);

});

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

test("API /package (no param)", function(t) {
    const req_obj = url.parse("http://127.0.0.1/package");

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

test("API /package (valid - json)", function(t) {
    const req_obj = url.parse("http://127.0.0.1/package");
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

            t.ok(parsed_data.hasOwnProperty("package"), "has package property");
            t.ok(parsed_data.hasOwnProperty("url"), "has url property");

        });

    }).on("error", (err) => {
        throw err;
    });

    t.plan(3);

});

test("API /package (valid - text)", function(t) {
    let req_obj = url.parse("http://127.0.0.1/package");
    let req_args = makeValidRequest();

    req_obj.query = req_args;

    let req_url = url.format(req_obj);

    req_obj = url.parse(req_url);
    req_obj.headers = {
        "Accept": "text/plain"
    };

    http.get(req_obj, (res) => {
        let res_data = "";

        res.on("data", (chunk) => {
            res_data += chunk;
        });

        res.on("end", () => {
            console.log(res_data);
            t.equal(res.statusCode, 200);
            t.notEqual(res_data.indexOf("/packages/"), -1);
        });

    }).on("error", (err) => {
        throw err;
    });

    t.plan(2);

});

test("API /package (valid - redirect)", function(t) {
    let req_obj = url.parse("http://127.0.0.1/package");
    let req_args = makeValidRequest();

    req_args.redirect = "yes";

    req_obj.query = req_args;

    let req_url = url.format(req_obj);

    req_obj = url.parse(req_url);
    req_obj.followAllRedirects = false;

    http.get(req_obj, (res) => {

        t.equal(res.statusCode, 302);
        console.log(res.headers.location);
        t.notEqual(res.headers.location.indexOf("/packages/"), -1);


    }).on("error", (err) => {
        throw err;
    });

    t.plan(2);

});

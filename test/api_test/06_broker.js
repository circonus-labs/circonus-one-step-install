/*eslint-env node, es6 */
/*eslint-disable no-process-exit */

"use strict";

// core modules
const http = require("http");
const url = require("url");

// local modules
const test = require("tape");

const url_path = "/broker";

const id = Date.now().toString();

function makeValidRequest() {
    return {
        "type": "Linux-gnu",
        "dist": "CentOS",
        "vers": "7.1.1503",
        "arch": "x86_64"
    };
}

test(`API ${url_path} (no param)`, function(t) {
    const req_obj = url.parse(`http://127.0.0.1${url_path}`);

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


test(`API ${url_path} (no mode)`, function(t) {
    const req_obj = url.parse(`http://127.0.0.1${url_path}`);
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

            t.equal(res.statusCode, 409);

            const parsed_data = JSON.parse(res_data);

            t.ok(parsed_data.hasOwnProperty("message"), "has message property");

            const msg = parsed_data.message.split(", ");

            t.equal(msg.length, 2);
            t.notEqual(msg[0].indexOf("mode"), -1);
            t.notEqual(msg[1].indexOf("ref id"), -1);

        });

    }).on("error", (err) => {
        throw err;
    });

    t.plan(5);

});


test(`API ${url_path} (valid pull)`, function(t) {
    const req_obj = url.parse(`http://127.0.0.1${url_path}`);
    let req_args = makeValidRequest();

    req_args.mode = "pull";

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

            t.ok(parsed_data.hasOwnProperty("broker_id"), "has message broker_id");
            t.equal(parsed_data.broker_id, 275);

        });

    }).on("error", (err) => {
        throw err;
    });

    t.plan(3);

});


test(`API ${url_path} (valid push)`, function(t) {
    const req_obj = url.parse(`http://127.0.0.1${url_path}`);
    let req_args = makeValidRequest();

    req_args.mode = "push";

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

            t.ok(parsed_data.hasOwnProperty("broker_id"), "has message broker_id");
            t.equal(parsed_data.broker_id, 35);

        });

    }).on("error", (err) => {
        throw err;
    });

    t.plan(3);

});

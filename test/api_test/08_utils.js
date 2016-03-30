/*eslint-env node, es6 */
/*eslint-disable no-process-exit */

"use strict";

// core modules
const http = require("http");
const url = require("url");
const crypto = require("crypto");
const fs = require("fs");

// local modules
const test = require("tape");

const url_path = "/utils";

const content_file = "/opt/circonus/osi-site/content/files/cosi-util.tar.gz";

const frs = fs.ReadStream(content_file);
const f_hash = crypto.createHash("sha256");

frs.on("data", (data) => {
    f_hash.update(data);
});

frs.on("end", () => {
    const file_hash = f_hash.digest("hex");

    test(`API ${url_path}`, function(t) {
        const req_obj = url.parse(`http://127.0.0.1${url_path}`);
        const r_hash = crypto.createHash("sha256");

        http.get(url.format(req_obj), (res) => {
            res.on("data", (chunk) => {
                r_hash.update(chunk);
            });

            res.on("end", () => {
                t.equal(res.statusCode, 200);

                const res_hash = r_hash.digest("hex");

                t.equal(file_hash, res_hash);

            });

        }).on("error", (err) => {
            throw err;
        });

        t.plan(2);

    });
});

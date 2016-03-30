"use strict";

/*eslint-env node, es6 */
/*eslint-disable no-magic-numbers */

const assert = require("assert");
const path = require("path");
const fs = require("fs");

const Template = require(path.resolve(path.join(__dirname, "..")));

function buildTemplateList(registrationDir, cb) {
    assert.strictEqual(typeof registrationDir, "string", "registrationDir is required");
    assert.strictEqual(typeof cb, "function", "cb must be a callback function");

    const templates = [];

    fs.readdir(registrationDir, (err, files) => {
        if (err) {
            console.log("template list, readdir", err);
            return cb(err);
        }

        for (let i = 0; i < files.length; i++) {
            const file = files[i];

            if (file.match(/^template-.*\.json$/)) {
                try {
                    templates.push({
                        file,
                        config: new Template(path.resolve(path.join(registrationDir, file)))
                    });
                }
                catch (errFile) {
                    console.log("template list, add to list", err);
                    return cb(errFile);
                }
            }
        }

        return cb(null, templates);
    });

}

module.exports = buildTemplateList;

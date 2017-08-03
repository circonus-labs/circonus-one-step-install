// Copyright 2016 Circonus, Inc. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

'use strict';

const path = require('path');
const fs = require('fs');

const cosi = require(path.resolve(path.join(__dirname, '..', '..')));
const Template = require(path.resolve(path.join(cosi.lib_dir, 'template')));

/**
 * build list of template files
 * @arg {String} dir to scan
 * @returns {Object} promise
 */
function buildTemplateList(dir) {
    return new Promise((resolve, reject) => {
        let templateDir = cosi.reg_dir;
        const templates = [];

        if (typeof dir === 'string') {
            templateDir = dir;
        }

        fs.readdir(templateDir, (err, files) => {
            if (err) {
                console.log('template list, readdir', err);
                reject(err);

                return;
            }

            for (const file of files) {
                if (file.match(/^template-.*\.json$/)) {
                    try {
                        templates.push({
                            config: new Template(path.resolve(path.join(cosi.reg_dir, file))),
                            file
                        });
                    } catch (errFile) {
                        console.log('template list, add to list', err);
                        reject(errFile);

                        return;
                    }
                }
            }

            resolve(templates);
        });
    });
}

module.exports = buildTemplateList;

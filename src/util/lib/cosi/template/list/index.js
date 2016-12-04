'use strict';

/* eslint-env node, es6 */

const path = require('path');
const fs = require('fs');

const cosi = require(path.resolve(path.join(__dirname, '..', '..')));
const Template = require(path.resolve(path.join(cosi.lib_dir, 'template')));

function buildTemplateList(dir, cb) {
    let templateDir = cosi.reg_dir;
    let callback = null;
    const templates = [];

    if (typeof dir === 'function') {
        callback = dir;
    } else {
        templateDir = dir;
        callback = cb;
    }

    fs.readdir(templateDir, (err, files) => {
        if (err) {
            console.log('template list, readdir', err);
            callback(err);
            return;
        }

        for (let i = 0; i < files.length; i++) {
            const file = files[i];

            if (file.match(/^template-.*\.json$/)) {
                try {
                    templates.push({
                        file,
                        config: new Template(path.resolve(path.join(cosi.reg_dir, file)))
                    });
                } catch (errFile) {
                    console.log('template list, add to list', err);
                    callback(errFile);
                    return;
                }
            }
        }

        callback(null, templates);
        return;
    });

}

module.exports = buildTemplateList;

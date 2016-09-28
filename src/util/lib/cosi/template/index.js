'use strict';

/* eslint-env node, es6 */
/* eslint-disable no-magic-numbers, no-process-exit */

const assert = require('assert');
const path = require('path');
const fs = require('fs');

const chalk = require('chalk');

const cosi = require(path.resolve(path.join(__dirname, '..')));

function templatePropertyFilter(key, value) {
    if (typeof value === 'function') {
        return undefined;   // eslint-disable-line no-undefined
    }
    /*
    if (key === 'id') {     // created when parsed/loaded, ignore
        return undefined;   // eslint-disable-line no-undefined
    }
    if (key === 'type') {   // created when parsed/loaded, ignore
        return undefined;   // eslint-disable-line no-undefined
    }
    */
    return value;
}

module.exports = class Template {
    constructor(src) {
        // convienence constructor (pass json string or file spec)
        if (src) {
            assert.strictEqual(typeof src, 'string', 'optional argument src, must be a string');
            if (src.substr(0, 1) === '{') { // smells like json
                this.parse(src);
            } else {
                this.load(src); // ASSume it's a file
            }
        }
    }

    empty() {
        return (Object.keys(this)).length === 0;
    }

    load(fileName) {
        assert.strictEqual(typeof fileName, 'string', 'fileName is required');

        let data = null;

        try {
            data = fs.readFileSync(fileName, { encoding: 'utf8' });
        } catch (err) {
            const msg = chalk.red('Load template:');

            if (err.code === 'ENOENT') {
                console.error(msg, err.toString());
                process.exit(1);
            }

            if (err.code === 'EACCES') {
                console.error(msg, err.toString());
                process.exit(1);
            }

            throw err;
        }

        this.parse(data);

        // do this *after* it is parsed, otherwise the properties
        // will be removed...
        const parts = path.basename(fileName, '.json').split('-');

        if (parts && parts.length >= 3) {
            this.id = parts[2].replace('.json', '');
            this.type = parts[1];
        } else {
            const err = new Error('Invalid template type');

            err.code = 'INVALID_TEMPLATE_TYPE';
            err.details = fileName;

            throw err;
        }
    }

    parse(str) {
        assert.strictEqual(typeof str, 'string', 'str is required');

        if (!this.empty()) {
            const props = Object.keys(this);

            for (let i = 0; i < props.length; i++) {
                delete this[props[i]];
            }
        }

        this.id = '(string)';
        this.type = 'n/a';

        const obj = JSON.parse(str);
        const keys = Object.keys(obj);

        for (let i = 0; i < keys.length; i++) {
            this[keys[i]] = obj[keys[i]];
        }
    }

    save(fileName, force) {
        fileName = fileName || path.resolve(path.join(cosi.reg_dir, `template-${this.type}-${this.id}.json`)); // eslint-disable-line no-param-reassign
        force = force || false;  // eslint-disable-line no-param-reassign

        const options = {
            encoding: 'utf8',
            mode: 0o644,
            flag: force ? 'w' : 'wx'
        };

        try {
            fs.writeFileSync(fileName, JSON.stringify(this, templatePropertyFilter, 4), options);
        } catch (err) {
            if (err.code === 'EEXIST') {
                console.error(chalk.red(`Template already exists, use --force to overwrite. '${fileName}'`));
                process.exit(1);
            }
            throw err;
        }

        return true;
    }
};

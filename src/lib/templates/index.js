/*eslint-env node, es6 */
/*eslint-disable global-require, no-magic-numbers */

"use strict";

// load core modules
const path = require("path");
const fs = require("fs");

// load app modules
const settings = require(path.normalize(path.join(__dirname, "..", "settings")));
const log = require(path.normalize(path.join(__dirname, "..", "logger")));

let instance = null;

class Templates {

    constructor() {
        if (instance !== null) {
            return instance;
        }

        instance = this; //eslint-disable-line consistent-this

        this.load_time = new Date();

        this.dir = settings.template_dir;

        this.cache = new Map();

        if (settings.cache_templates) {
            // prime the cache with the defaults
            // any targeted templates will be loaded on first request
            this._loadDefaultTemplates();
        }

        return instance;
    }


    get(templateCategory, templateName, dist, vers, arch) {
        const templateFileName = `${templateCategory}-${templateName}.json`;
        const defaultFileList = [
            {
                key: this._templateKey(templateCategory, templateName),
                file: path.resolve(path.join(this.dir, templateFileName))
            }
        ];

        if (dist) {
            defaultFileList.unshift({
                key: this._templateKey(templateCategory, templateName, dist),
                file: path.resolve(path.join(this.dir, dist, templateFileName))
            });
            if (vers) {
                defaultFileList.unshift({
                    key: this._templateKey(templateCategory, templateName, dist, vers),
                    file: path.resolve(path.join(this.dir, dist, vers, templateFileName))
                });
                if (arch) {
                    defaultFileList.unshift({
                        key: this._templateKey(templateCategory, templateName, dist, vers, arch),
                        file: path.resolve(path.join(this.dir, dist, vers, arch, templateFileName))
                    });
                }
            }
        }

        for (const templateDefinition of defaultFileList) {
            if (this.cache.has(templateDefinition.key)) {
                return this.cache.get(templateDefinition.key);
            }

            try {
                const template = require(templateDefinition.file);

                if (settings.cache_templates) {
                    this.cache.set(templateDefinition.key, template);
                }

                return template;

            }
            catch (err) {
                if (err.code !== "MODULE_NOT_FOUND") {
                    log.warn(`Template found but, unable to load: ${templateDefinition.file} ${err}`);
                }
            }
        }

        return null;
    }


    list(dist, vers, arch) {
        const result = {};

        // hot mess, needs to be made more efficent

        // start with defaults
        Object.assign(result, this._listDir());

        if (dist) {
            // overlay dist specific
            Object.assign(result, this._listDir(dist));
            if (vers) {
                // overlay version specific
                Object.assign(result, this._listDir(dist, vers));
                if (arch) {
                    // finally, overlay architecture specific
                    Object.assign(result, this._listDir(dist, vers, arch));
                }
            }
        }

        return Object.keys(result);
    }


    _listDir(dist, vers, arch) {
        const dirs = [ this.dir ];

        if (dist) {
            dirs.push(dist);
        }

        if (vers) {
            dirs.push(vers);
        }

        if (arch) {
            dirs.push(arch);
        }

        const dir = path.resolve(dirs.join(path.sep));
        const result = {};

        try {
            const files = fs.readdirSync(dir);

            for (const file of files) {
                result[file.replace(".json", "")] = path.resolve(dir, file);
            }
        }
        catch (err) {
            if (err.code !== "ENOENT") {
                log.info(err.message);
            }
        }

        return result;

    }


    _loadDefaultTemplates() {
        const files = fs.readdirSync(this.dir);

        log.info("Loading default templates");

        for (const file of files) {
            const matches = file.match(/^([a-z]+)\-([a-z_]+)\.json$/);

            if (matches && matches.length === 3) {

                const templateCategory = matches[1];
                const templateName = matches[2];
                let template = null;

                try {
                    template = require(path.resolve(path.join(this.dir, file)));
                }
                catch (err) {
                    log.error(`Unable to load template ${file} ${err}`);
                    continue;
                }

                const templateKey = this._templateKey(templateCategory, templateName);

                log.info(`Adding default template ${templateKey} ${file}`);
                this.cache.set(templateKey, template);
            }
        }
    }


    _templateKey(templateCategory, templateName, dist, vers, arch) {
        return `${dist || ""}|${vers || ""}|${arch || ""}|${templateCategory}-${templateName}`;
    }

}

module.exports = new Templates();

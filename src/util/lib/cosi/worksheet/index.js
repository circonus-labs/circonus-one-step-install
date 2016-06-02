"use strict";

/*eslint-env node, es6 */
/*eslint-disable no-magic-numbers */
/*eslint camelcase: [2, {properties: "never"}]*/

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const chalk = require("chalk");

const cosi = require(path.resolve(path.join(__dirname, "..")));
const api = require(path.resolve(cosi.lib_dir, "api"));

module.exports = class Worksheet {

    //
    // load a worksheet (config/registration)
    //
    constructor(configFile) {
        // configFile must be either a "config-" or "registration-"

        if (!configFile) {
            throw new Error("Missing Argument: configFile");
        }

        if (!configFile.match(/\/(config|registration)-worksheet-/)) {
            throw new Error(`Invalid worksheet configuration/registration file '${configFile}'`);
        }

        const cfgFile = path.resolve(configFile);

        try {
            const config = require(cfgFile); //eslint-disable-line global-require

            this._init(config);
        }
        catch (err) {
            if (err.code === "MODULE_NOT_FOUND") {
                console.error(chalk.red("ERROR - worksheet configuration file not found:"), cfgFile);
                process.exit(1); //eslint-disable-line no-process-exit
            }
            else {
                throw err;
            }
        }
    }


    save(configFile, force) {
        assert.strictEqual(typeof configFile, "string", "configFile is required");

        const cfgFile = path.resolve(configFile);

        try {
            fs.writeFileSync(
                cfgFile,
                JSON.stringify(this, null, 4),
                { encoding: "utf8", mode: 0o644, flag: force ? "w" : "wx" });
        }
        catch (err) {
            // fs write errors are passed up (not handled, e.g. ENOENT, EEXIST, etc.)
            throw err;
        }

        return cfgFile;
    }


    //
    // verifies all of the attributes are present for create but *does not*
    // validate the values of each attribute!!! (yet)
    //
    verifyConfig(existing) {
        // default existing to false, most restrictive verify
        // (ensures attributes which could alter an *existing* worksheet are not present)
        existing = typeof existing === "undefined" ? false : existing; //eslint-disable-line no-param-reassign

        const requiredAttributes = [
            "description",          // string
            "favorite",             // boolean
            "notes",                // string
            "tags",                 // array (of strings)
            "title"                 // string
        ];

        // note - at least ONE of these is required to make the worksheet valid
        const optionalAttributes = [
            "graphs",           // array (of objects)
            "smart_queries"     // array (of objects)
        ];

        const requiredGraphsAttributes = [
            "graph"             // string (graph cid)
        ];

        const requiredSmartQueriesAttributes = [
            "name",             // string
            "order",            // array (of string - graph cids)
            "query"             // string
        ];

        const requiredExistingAttributes = [
            "_cid"              // string
        ];

        let errors = 0;

        // for (const attr of requiredExistingAttributes) {
        for (let i = 0; i < requiredExistingAttributes.length; i++) {
            const attr = requiredExistingAttributes[i];

            if (existing && !this.hasOwnProperty(attr)) {
                console.error(chalk.red("Missing attribute"), attr, "required for", chalk.bold("existing"), "worksheet");
                errors += 1;
            }

            if (!existing && this.hasOwnProperty(attr)) {
                console.error(chalk.red("Invalid attribute"), attr, "for", chalk.bold("new"), "worksheet");
                errors += 1;
            }
        }

        // for (const attr of requiredAttributes) {
        for (let i = 0; i < requiredAttributes.length; i++) {
            const attr = requiredAttributes[i];

            if (!this.hasOwnProperty(attr)) {
                console.error(chalk.red("Missing attribute"), attr);
                errors += 1;
            }
        }

        let hasOne = false;

        // for (const attr of optionalAttributes) {
        for (let i = 0; i < optionalAttributes.length; i++) {
            const attr = optionalAttributes[i];

            if (this.hasOwnProperty(attr)) {
                if (Array.isArray(this[attr]) && this[attr].length > 0) {
                    hasOne = true;
                }
            }
            else {
                console.error(`Missing ${chalk.yellow("OPTIONAL")} attribute ${attr}, ignoring.`);
            }
        }

        if (!hasOne) {
            console.error(chalk.red("ERROR"), "One of 'graphs' or 'smart_queries' is requried.");
            errors += 1;
        }

        if (this.hasOwnProperty("graphs")) {
            for (let idx = 0; idx < this.graphs.length; idx++) {
                // for (const attr of requiredGraphsAttributes) {
                for (let i = 0; i < requiredGraphsAttributes.length; i++) {
                    const attr = requiredGraphsAttributes[i];

                    if (!this.graphs[idx].hasOwnProperty(attr)) {
                        console.error(chalk.red("Missing attribute"), `graphs item #${idx}requires '${attr}'`);
                        errors += 1;
                    }
                }
            }
        }

        if (this.hasOwnProperty("smart_queries")) {
            // for (const query of this.smart_queries) {
            for (let queryIdx = 0; queryIdx < this.smart_queries.length; queryIdx++) {
                const query = this.smart_queries[queryIdx];

                // for (const attr of requiredSmartQueriesAttributes) {
                for (let i = 0; i < requiredSmartQueriesAttributes.length; i++) {
                    const attr = requiredSmartQueriesAttributes[i];

                    if (!query.hasOwnProperty(attr)) {
                        console.error(chalk.red("Missing attribute"), `smart query '${query.name || query.query}' requires '${attr}'`);
                        errors += 1;
                    }
                }
            }
        }

        return errors === 0;

    }

    create(cb) { //eslint-disable-line consistent-return
        assert.strictEqual(typeof cb, "function", "cb must be a callback function");

        if (!this.verifyConfig(false)) {
            return cb(new Error("Invalid configuration"));
        }

        const self = this;

        api.setup(cosi.api_key, cosi.api_app, cosi.api_url);
        api.post("/worksheet", this, (code, errAPI, result) => {
            if (errAPI) {
                const apiError = new Error();

                apiError.code = "CIRCONUS_API_ERROR";
                apiError.message = errAPI;
                apiError.details = result;
                return cb(apiError);
            }

            if (code !== 200) {
                const errResp = new Error();

                errResp.code = code;
                errResp.message = "UNEXPECTED_API_RETURN";
                errResp.details = result;
                return cb(errResp);

            }

            self._init(result);

            return cb(null, result);
        });
    }


    update(cb) { //eslint-disable-line consistent-return
        assert.strictEqual(typeof cb, "function", "cb must be a callback function");

        if (!this.verifyConfig(true)) {
            return cb(new Error("Invalid configuration"));
        }

        const self = this;

        api.setup(cosi.api_key, cosi.api_app, cosi.api_url);
        api.put(this._cid, this, (code, errAPI, result) => {
            if (errAPI) {
                return cb(errAPI, result);
            }

            if (code !== 200) {
                const errResp = new Error();

                errResp.code = code;
                errResp.message = "UNEXPECTED_API_RETURN";
                errResp.details = result;
                return cb(errResp);

            }

            self._init(result);

            return cb(null, result);
        });
    }


    _init(config) {
        const keys = Object.keys(config);

        for (let i = 0; i < keys.length; i++) {
            const key = keys[i];

            if (config.hasOwnProperty(key)) {
                this[key] = config[key];
            }
        }
    }

};

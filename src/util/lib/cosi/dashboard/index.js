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

module.exports = class Dashboard {

    //
    // load a dashboard (config/registration)
    //
    constructor(configFile) {
        // configFile must be either a "config-" or "registration-"

        if (!configFile) {
            throw new Error("Missing Argument: configFile");
        }

        if (!configFile.match(/\/(config|registration)-dashboard-/)) {
            throw new Error(`Invalid dashboard configuration/registration file '${configFile}'`);
        }

        const cfgFile = path.resolve(configFile);

        try {
            const config = require(cfgFile); //eslint-disable-line global-require

            this._init(config);
        }
        catch (err) {
            if (err.code === "MODULE_NOT_FOUND") {
                console.error(chalk.red("ERROR - dashboard configuration file not found:"), cfgFile);
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
            "account_default",      // boolean
            "widgets",              // object of objects
            "grid_layout",          // object
            "shared",               // boolean
            "title"                 // string
        ];

        const requiredWidgetsAttributes = [
            "height",            // number
            "name",              // string
            "origin",            // string
            "settings",          // object
            "width"              // number
        ];

        const requiredWidgetSettingsAttributes = [
            "account_id"        // number
            
        ];

        const requiredExistingAttributes = [
            "_cid"              // string
        ];

        let errors = 0;

        // for (const attr of requiredExistingAttributes) {
        for (let i = 0; i < requiredExistingAttributes.length; i++) {
            const attr = requiredExistingAttributes[i];

            if (existing && !this.hasOwnProperty(attr)) {
                console.error(chalk.red("Missing attribute"), attr, "required for", chalk.bold("existing"), "dashboard");
                errors += 1;
            }

            if (!existing && this.hasOwnProperty(attr)) {
                console.error(chalk.red("Invalid attribute"), attr, "for", chalk.bold("new"), "dashboard");
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

        for (let idx = 0; idx < this.widgets.length; idx++) {
            // for (const attr of requiredWidgetsAttributes) {
            for (let i = 0; i < requiredWidgetsAttributes.length; i++) {
                const attr = requiredWidgetsAttributes[i];

                if (!this.widgets[idx].hasOwnProperty(attr)) {
                    console.error(chalk.red("Missing attribute"), `widgets item #${idx}requires '${attr}'`);
                    errors += 1;
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
        api.post("/dashboard", this, (code, errAPI, result) => {
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

    remove(cb) {
        assert.strictEqual(typeof cb, "function", "cb must be a callback function");

        const self = this;

        api.setup(cosi.api_key, cosi.api_app, cosi.api_url);

        api.get(self._cid, null, (getCode, getError, getResult) => { //eslint-disable-line consistent-return
            if (getCode === 404 && (getResult.code && getResult.code === "ObjectError.InstanceNotFound")) {
                console.log(`\t${self._cid}`, chalk.bold("not found"));
                return cb(null);
            }

            if (getCode < 200 || getCode > 299) { //eslint-disable-line no-magic-numbers
                console.error(chalk.red("API RESULT CODE"), `API ${getCode}`, getError, getResult);
                return cb(getError);
            }

            console.log(chalk.bold("\tDeleting"), `Dashboard ${self._cid}`);

            api.delete(self._cid, (code, errAPI, result) => {
                if (errAPI) {
                    return cb(errAPI, result);
                }

                if (code < 200 || code > 299) { //eslint-disable-line no-magic-numbers
                    console.error(chalk.red("API RESULT CODE"), `API ${code}`, errAPI, result);
                    return cb(`unexpected code: ${code}`, result);
                }
                return cb(null, result);
            });
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

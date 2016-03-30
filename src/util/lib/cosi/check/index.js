"use strict";

/*eslint-env node, es6 */
/*eslint-disable no-magic-numbers */

const assert = require("assert");
const path = require("path");
const fs = require("fs");

const api = require("circonusapi2");
const chalk = require("chalk");

const cosi = require(path.resolve(path.join(__dirname, "..")));

module.exports = class Check {

    //
    // load a check (template/config/registration)
    //
    constructor(configFile) {
        assert.strictEqual(typeof configFile, "string", "configFile is required");

        // configFile can be either a "config-", "template-", or "registration-"

        if (!configFile) {
            throw new Error("Missing Argument: configFile");
        }

        const cfgFile = path.resolve(configFile);

        try {
            const cfg = require(cfgFile); //eslint-disable-line global-require

            if (cfg.hasOwnProperty("check")) {
                this._init(cfg.check);  // template (templates contain extra metadata)
            }
            else {
                this._init(cfg);        // config or registration
            }
        }
        catch (err) {
            if (err.code === "MODULE_NOT_FOUND") {
                console.error(chalk.red("ERROR - check configuration file not found:"), cfgFile);
                process.exit(1); //eslint-disable-line no-process-exit
            }
            else {
                throw err;
            }
        }
    }

    //
    // verifies all of the attributes are present for a "new" or "existing" check
    // valid actions for new are create/POST
    // valid actions for existing are retrieve/GET, update/PUT, delete/DELETE
    //
    verifyConfig(existing) {
        // default existing to false, most restrictive verify
        // (ensures attributes which could alter an *existing* check are not present)
        existing = typeof existing === "undefined" ? false : existing; //eslint-disable-line no-param-reassign

        const requiredCheckAttributes = [
            "brokers",      // array, len > 0
            "config",       // object
            "display_name", // string
            "metrics",      // array, len > 0
            "notes",        // opt, string
            "period",       // int > 0
            "status",       // opt, "active"
            "tags",         // array
            "target",       // string
            "timeout",      // int > 0
            "type"          // for cosi (httptrap|json:nad|statsd)
        ];

        // optional because check creation will not fail if not present
        // but also because a default value will result in the property
        // not being returned from the API
        const optionalCheckAttributes = [
            "metric_limit"  // numeric
        ];

        const requiredMetricAttributes = [
            "name",         // string
            "type",         // /^(numeric|text)$/
            "status"        // /^(active|available)$/
        ];

        const requiredExistingCheckAttributes = [
            "_cid",
            "_check_uuids",
            "_checks",
            "_created",
            "_last_modified",
            "_last_modified_by",
            "_reverse_connection_urls"
        ];

        let errors = 0;

        // for (const attr of requiredExistingCheckAttributes) {
        for (let i = 0; i < requiredExistingCheckAttributes.length; i++) {
            const attr = requiredExistingCheckAttributes[i];

            // an existing check (get/put/delete) *must* have these attributes
            if (existing && !this.hasOwnProperty(attr)) {
                console.error(chalk.red("Missing attribute"), attr, "required for", chalk.bold("existing"), "check");
                errors += 1;
            }
            // a check to be created (post) must *not* have these attributes
            if (!existing && this.hasOwnProperty(attr)) {
                console.error(chalk.red("Invalid attribute"), attr, "for", chalk.bold("new"), "check");
                errors += 1;
            }
        }

        // for (const attr of requiredCheckAttributes) {
        for (let i = 0; i < requiredCheckAttributes.length; i++) {
            const attr = requiredCheckAttributes[i];

            if (!this.hasOwnProperty(attr)) {
                console.error(chalk.red("Missing attribute"), attr);
                errors += 1;
            }
        }

        // for (const attr of optionalCheckAttributes) {
        for (let i = 0; i < optionalCheckAttributes.length; i++) {
            const attr = optionalCheckAttributes[i];

            if (!this.hasOwnProperty(attr)) {
                console.error(`Missing ${chalk.yellow("OPTIONAL")} attribute ${attr}, ignoring.`);
            }
        }

        // for (const metric of this.metrics) {
        for (let metricIdx = 0; metricIdx < this.metrics.length; metricIdx++) {
            const metric = this.metrics[metricIdx];

            // for (const attr of requiredMetricAttributes) {
            for (let i = 0; i < requiredMetricAttributes.length; i++) {
                const attr = requiredMetricAttributes[i];

                if (!metric.hasOwnProperty(attr)) {
                    console.error(chalk.red("Missing attribute"), `metric '${metric}' requires '${attr}'`);
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
        api.post("/check_bundle", this, (code, errAPI, result) => {
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


    save(fileName, force) {
        assert.strictEqual(typeof fileName, "string", "fileName is required");
        force = force || false;  //eslint-disable-line no-param-reassign

        const options = {
            encoding: "utf8",
            mode: 0o640,
            flag: force ? "w" : "wx"
        };

        try {
            fs.writeFileSync(fileName, JSON.stringify(this, null, 4), options);
        }
        catch (err) {
            if (err.code === "EEXIST") {
                console.error(chalk.red(`Check already exists, use --force to overwrite. '${fileName}'`));
                process.exit(1); //eslint-disable-line no-process-exit
            }
            throw err;
        }

        return true;
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

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

module.exports = class Graph {

    //
    // load a graph (config/registration)
    // note: this is *not* for templates, templates contain 1-n graphs
    //
    constructor(configFile) {
        // configFile must be either a "config-" or "registration-"

        if (!configFile) {
            throw new Error("Missing Argument: configFile");
        }

        if (!configFile.match(/\/(config|registration)-graph-/)) {
            throw new Error(`Invalid graph configuration/registration file '${configFile}'`);
        }

        const cfgFile = path.resolve(configFile);

        try {
            const config = require(cfgFile); //eslint-disable-line global-require

            this._init(config);
        }
        catch (err) {
            if (err.code === "MODULE_NOT_FOUND") {
                console.error(chalk.red("ERROR - graph configuration file not found:"), cfgFile);
                process.exit(1); //eslint-disable-line no-process-exit
            }
            else {
                throw err;
            }
        }
    }


    isPreConfig() {
        if (this.hasOwnProperty("datapoints") &&
            Array.isArray(this.datapoints) &&
            this.datapoints.length > 0) {

            // for (const datapoint of this.datapoints) {
            for (let i = 0; i < this.datapoints.length; i++) {
                const datapoint = this.datapoints[i];

                if (datapoint.check_id === null) {
                    return true;
                }
            }
        }
        return false;
    }

    preToConfig(checkId) {
        assert.strictEqual(typeof checkId, "string", "checkId is required");

        if (this.isPreConfig()) {
            for (let i = 0; i < this.datapoints.length; i++) {
                this.datapoints[i].check_id = checkId;
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
        // (ensures attributes which could alter an *existing* graph are not present)
        existing = typeof existing === "undefined" ? false : existing; //eslint-disable-line no-param-reassign

        // pre-configs by definition are not ready to be submitted to create a graph
        if (this.isPreConfig()) {
            return false;
        }

        const requiredAttributes = [
            "access_keys",          // array (of objects)
            "composites",           // array (of objects)
            "datapoints",           // array (of objects)
            "description",          // string
            "guides",               // array (of objects)
            "line_style",           // string (stepped|interpolated|null)
            "logarithmic_left_y",   // number or null
            "logarithmic_right_y",  // number or null
            "max_left_y",           // number or null
            "max_right_y",          // number or null
            "metric_clusters",      // array (of objects)
            "min_left_y",           // number or null
            "min_right_y",          // number or null
            "notes",                // string
            "style",                // string (area|line|null)
            "tags",                 // array (of strings)
            "title"                 // string
        ];

        const requiredCompositeAttributes = [
            "axis",             // string (l,r,null)
            "color",            // string (html rgb hex string e.g. #f832b1)
            "data_formula",     // string
            "hidden",           // boolean
            "legend_formula",   // string
            "name",             // string
            "stack"             // number
        ];

        const requiredDatapointAttributes = [
            "axis",             // string (l,r,null)
            "check_id",         // number
            "color",            // string (html rgb hex string e.g. #f832b1)
            "data_formula",     // string
            "derive",           // string (gauge/derive/counter)[_stddev]
            "hidden",           // boolean
            "legend_formula",   // string
            "metric_name",      // string
            "metric_type",      // string (numeric|histogram|composite)
            "name",             // string
            "stack",            // number
            "alpha"             // number (floating point, between 0 and 1)
        ];

        const requiredGuideAttributes = [
            "color",            // string
            "data_formula",     // string
            "hidden",           // boolean
            "legend_formula",   // string
            "name"              // string
        ];

        const requiredMetricClusterAttributes = [
            "axis",                 // string (l,r,null)
            "data_formula",         // string
            "hidden",               // boolean
            "legend_formula",       // string
            "metric_cluster",       // string
            "name",                 // string
            "stack",                // number
            "aggregate_function"    // string (none|min|max|sum|mean|geometric_mean|null)
        ];

        // 1. a configuration to be created
        // must *not* contain *any* of these
        //
        // 2. a configuration that has already
        // been created doesn't need verifying...
        const requiredExistingAttributes = [
            "_cid"
        ];

        let errors = 0;

        // for (const attr of requiredExistingAttributes) {
        for (let i = 0; i < requiredExistingAttributes.length; i++) {
            const attr = requiredExistingAttributes[i];

            if (existing && !this.hasOwnProperty(attr)) {
                console.error(chalk.red("Missing attribute"), attr, "required for", chalk.bold("existing"), "graph");
                errors += 1;
            }

            if (!existing && this.hasOwnProperty(attr)) {
                console.error(chalk.red("Invalid attribute"), attr, "for", chalk.bold("new"), "graph");
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

        // for (const datapoint of this.datapoints) {
        for (let dpIdx = 0; dpIdx < this.datapoints.length; dpIdx++) {
            const datapoint = this.datapoints[dpIdx];

        //     for (const attr of requiredDatapointAttributes) {
            for (let i = 0; i < requiredDatapointAttributes.length; i++) {
                const attr = requiredDatapointAttributes[i];

                if (!datapoint.hasOwnProperty(attr)) {
                    console.error(chalk.red("Missing attribute"), `datapoint '${datapoint.metric_name || datapoint.name}' requires '${attr}'`);
                    errors += 1;
                }
                if (attr === "check_id" && datapoint.check_id === null) {
                    console.error(chalk.red("Invalid attribute value"), `datapoint '${datapoint.metric_name || datapoint.name}' requires valid '${attr}'`);
                    errors += 1;
                }
            }
        }

        if (Array.isArray(this.composites)) {
            // for (const composite of this.composites) {
            for (let cIdx = 0; cIdx < this.composites.length; cIdx++) {
                const composite = this.composites[cIdx];

                // for (const attr of requiredCompositeAttributes) {
                for (let i = 0; i < requiredCompositeAttributes.length; i++) {
                    const attr = requiredCompositeAttributes[i];

                    if (!composite.hasOwnProperty(attr)) {
                        console.error(chalk.red("Missing attribute"), `composite '${composite.name}' requires '${attr}'`);
                        errors += 1;
                    }
                }
            }
        }

        if (Array.isArray(this.guides)) {
            // for (const guide of this.guides) {
            for (let guideIdx = 0; guideIdx < this.guides.length; guideIdx++) {
                const guide = this.guides[guideIdx];

                // for (const attr of requiredGuideAttributes) {
                for (let i = 0; i < requiredGuideAttributes.length; i++) {
                    const attr = requiredGuideAttributes[i];

                    if (!guide.hasOwnProperty(attr)) {
                        console.error(chalk.red("Missing attribute"), `guide '${guide.name}' requires '${attr}'`);
                        errors += 1;
                    }
                }
            }
        }

        if (Array.isArray(this.metric_clusters)) {
            // for (const cluster of this.metric_clusters) {
            for (let clusterIdx = 0; clusterIdx < this.metric_clusters.length; clusterIdx++) {
                const cluster = this.metric_clusters[clusterIdx];

                // for (const attr of requiredMetricClusterAttributes) {
                for (let i = 0; i < requiredMetricClusterAttributes.length; i++) {
                    const attr = requiredMetricClusterAttributes[i];

                    if (!cluster.hasOwnProperty(attr)) {
                        console.error(chalk.red("Missing attribute"), `metric cluster '${cluster.name}' requires '${attr}'`);
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
        api.post("/graph", this, (code, errAPI, result) => {
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

            console.log(chalk.bold("\tDeleting"), `Graph ${self._cid}`);

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

        // for (const key of keys) {
        for (let i = 0; i < keys.length; i++) {
            const key = keys[i];

            if (config.hasOwnProperty(key)) {
                this[key] = config[key];
            }
        }
    }

};

// Copyright 2016 Circonus, Inc. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const chalk = require('chalk');

const cosi = require(path.resolve(path.join(__dirname, '..')));
const api = require(path.resolve(cosi.lib_dir, 'api'));

module.exports = class Graph {

    /**
     * create new graph object
     * load a graph (config/registration)
     * note: this is *not* for templates, templates contain 1-n graphs
     * @arg {String} configFile to load, must match (config|registration)-graph-.*\.json
     */
    constructor(configFile) {
        if (!configFile) {
            throw new Error('Missing Argument: configFile');
        }

        if (!configFile.match(/\/(config|registration)-graph-.*\.json/)) {
            throw new Error(`Invalid graph configuration/registration file '${configFile}'`);
        }

        const cfgFile = path.resolve(configFile);

        try {
            const config = require(cfgFile); // eslint-disable-line global-require

            this._init(config);
        } catch (err) {
            if (err.code === 'MODULE_NOT_FOUND') {
                console.error(chalk.red('ERROR - graph configuration file not found:'), cfgFile);
                process.exit(1); // eslint-disable-line no-process-exit
            } else {
                throw err;
            }
        }
    }


    /**
     * save current config to file
     * @arg {String} configFile to save
     * @arg {Boolean} force overwrite if it exists
     * @returns {String} name of file saved, or throws an error on failure
     */
    save(configFile, force) {
        assert.strictEqual(typeof configFile, 'string', 'configFile is required');

        const cfgFile = path.resolve(configFile);

        try {
            fs.writeFileSync(
                cfgFile,
                JSON.stringify(this, null, 4), {
                    encoding : 'utf8',
                    flag     : force ? 'w' : 'wx',
                    mode     : 0o644
                });
        } catch (err) {
            throw err; // fs write errors are passed up (not handled, e.g. ENOENT, EEXIST, etc.)
        }

        return cfgFile;
    }


    /**
     * verifies all of the attributes are present for create but *does not*
     * validate the values of each attribute!!! (yet)
     * @arg {Boolean} existing false = more restrictive, ensures attributes which
     *                         could alter an *existing* graph are not present.
     *                         Default: false
     * @returns {Boolean} whether the config is valid or not
     */
    verifyConfig(existing) { // eslint-disable-line complexity
        existing = typeof existing === 'undefined' ? false : existing; // eslint-disable-line no-param-reassign

        const requiredAttributes = [
            'access_keys',          // array (of objects)
            'composites',           // array (of objects)
            'datapoints',           // array (of objects)
            'description',          // string
            'guides',               // array (of objects)
            'line_style',           // string (stepped|interpolated|null)
            'logarithmic_left_y',   // number or null
            'logarithmic_right_y',  // number or null
            'max_left_y',           // number or null
            'max_right_y',          // number or null
            'metric_clusters',      // array (of objects)
            'min_left_y',           // number or null
            'min_right_y',          // number or null
            'notes',                // string
            'style',                // string (area|line|null)
            'tags',                 // array (of strings)
            'title'                 // string
        ];

        const requiredCompositeAttributes = [
            'axis',             // string (l,r,null)
            'color',            // string (html rgb hex string e.g. #f832b1)
            'data_formula',     // string
            'hidden',           // boolean
            'legend_formula',   // string
            'name',             // string
            'stack'             // number
        ];

        const requiredDatapointAttributes = [
            'axis',             // string (l,r,null)
            'check_id',         // number
            'color',            // string (html rgb hex string e.g. #f832b1)
            'data_formula',     // string
            'derive',           // string (gauge/derive/counter)[_stddev]
            'hidden',           // boolean
            'legend_formula',   // string
            'metric_name',      // string
            'metric_type',      // string (numeric|histogram|composite)
            'name',             // string
            'stack',            // number
            'alpha'             // number (floating point, between 0 and 1)
        ];

        const requiredGuideAttributes = [
            'color',            // string
            'data_formula',     // string
            'hidden',           // boolean
            'legend_formula',   // string
            'name'              // string
        ];

        const requiredMetricClusterAttributes = [
            'axis',                 // string (l,r,null)
            'data_formula',         // string
            'hidden',               // boolean
            'legend_formula',       // string
            'metric_cluster',       // string
            'name',                 // string
            'stack',                // number
            'aggregate_function'    // string (none|min|max|sum|mean|geometric_mean|null)
        ];

        // 1. a configuration to be created must *not* contain *any* of these
        // 2. a configuration that has already been created doesn't need verifying...
        const requiredExistingAttributes = [
            '_cid'
        ];

        let errors = 0;

        for (const attr of requiredExistingAttributes) {
            if (existing && !{}.hasOwnProperty.call(this, attr)) {
                console.error(chalk.red('Missing attribute'), attr, 'required for', chalk.bold('existing'), 'graph');
                errors += 1;
            }

            if (!existing && {}.hasOwnProperty.call(this, attr)) {
                console.error(chalk.red('Invalid attribute'), attr, 'for', chalk.bold('new'), 'graph');
                errors += 1;
            }
        }

        for (const attr of requiredAttributes) {
            if (!{}.hasOwnProperty.call(this, attr)) {
                console.error(chalk.red('Missing attribute'), attr);
                errors += 1;
            }
        }

        for (const datapoint of this.datapoints) {
            for (const attr of requiredDatapointAttributes) {
                if (!{}.hasOwnProperty.call(datapoint, attr)) {
                    console.error(chalk.red('Missing attribute'), `datapoint '${datapoint.metric_name || datapoint.name}' requires '${attr}'`);
                    errors += 1;
                }
                if (attr === 'check_id' && datapoint.check_id === null) {
                    console.error(chalk.red('Invalid attribute value'), `datapoint '${datapoint.metric_name || datapoint.name}' requires valid '${attr}'`);
                    errors += 1;
                }
            }
        }

        if (Array.isArray(this.composites)) {
            for (const composite of this.composites) {
                for (const attr of requiredCompositeAttributes) {
                    if (!{}.hasOwnProperty.call(composite, attr)) {
                        console.error(chalk.red('Missing attribute'), `composite '${composite.name}' requires '${attr}'`);
                        errors += 1;
                    }
                }
            }
        }

        if (Array.isArray(this.guides)) {
            for (const guide of this.guides) {
                for (const attr of requiredGuideAttributes) {
                    if (!{}.hasOwnProperty.call(guide, attr)) {
                        console.error(chalk.red('Missing attribute'), `guide '${guide.name}' requires '${attr}'`);
                        errors += 1;
                    }
                }
            }
        }

        if (Array.isArray(this.metric_clusters)) {
            for (const cluster of this.metric_clusters) {
                for (const attr of requiredMetricClusterAttributes) {
                    if (!{}.hasOwnProperty.call(cluster, attr)) {
                        console.error(chalk.red('Missing attribute'), `metric cluster '${cluster.name}' requires '${attr}'`);
                        errors += 1;
                    }
                }
            }
        }

        return errors === 0;
    }

    /**
     * call api to create a graph from current config
     * @returns {Object} promise
     */
    create() {
        return new Promise((resolve, reject) => {
            if (!this.verifyConfig(false)) {
                reject(new Error('Invalid configuration'));

                return;
            }

            api.post('/graph', this).
                then((res) => {
                    if (res.parsed_body === null || res.code !== 200) {
                        const err = new Error();

                        err.code = res.code;
                        err.message = 'UNEXPECTED_API_RETURN';
                        err.body = res.parsed_body;
                        err.raw_body = res.raw_body;

                        reject(err);

                        return;
                    }

                    this._init(res.parsed_body);

                    resolve(res.parsed_body);
                }).
                catch((err) => {
                    reject(err);
                });
        });
    }


    /**
     * call api to update a graph from current config
     * @returns {Object} promise
     */
    update() {
        assert.strictEqual(typeof cb, 'function', 'cb must be a callback function');

        return new Promise((resolve, reject) => {
            if (!this.verifyConfig(true)) {
                reject(new Error('Invalid configuration'));

                return;
            }

            api.put(this._cid, this).
                then((res) => {
                    if (res.parsed_body === null || res.code !== 200) {
                        const err = new Error();

                        err.code = res.code;
                        err.message = 'UNEXPECTED_API_RETURN';
                        err.body = res.parsed_body;
                        err.raw_body = res.raw_body;

                        reject(err);

                        return;
                    }

                    this._init(res.parsed_body);

                    resolve(res.parsed_body);
                }).
                catch((err) => {
                    reject(err);
                });
        });
    }

    /**
     * call api to delete a graph from current config
     * note the current config must contain a `_cid` attribute
     * @returns {Object} promise
     */
    remove() {
        return new Promise((resolve, reject) => {
            if (!{}.hasOwnProperty.call(this, '_cid')) {
                reject(new Error('Invalid graph config, no _cid attribute'));

                return;
            }

            api.get(this._cid, null).
                then((res) => {
                    if (res.code === 404 && (res.parsed_body.code && res.parsed_body.code === 'ObjectError.InstanceNotFound')) {
                        console.log(`\t${this._cid}`, chalk.bold('not found'));
                        resolve(null);

                        return false;
                    }

                    if (res.parsed_body === null || (res.code < 200 || res.code > 299)) {
                        const err = new Error();

                        err.code = res.code;
                        err.message = 'UNEXPECTED_API_RETURN';
                        err.body = res.parsed_body;
                        err.raw_body = res.raw_body;

                        reject(err);

                        return false;
                    }

                    return true;
                }).
                then((ok) => {
                    if (!ok) {
                        return;
                    }
                    console.log(chalk.bold('\tDeleting'), `Graph ${this._cid}`);

                    api.delete(this._cid).
                        then((result) => {
                            if (result.code < 200 || result.code > 299) {
                                const err = new Error();

                                err.code = result.code;
                                err.message = 'UNEXPECTED_API_RETURN';
                                err.body = result.parsed_body;
                                err.raw_body = result.raw_body;

                                reject(err);

                                return;
                            }
                            resolve(result.parsed_body);
                        }).
                        catch((err) => {
                            reject(err);
                        });
                }).
                catch((err) => {
                    reject(err);
                });
        });
    }


    /**
     * initializes the current object with values from a loaded configuration
     * @arg {Object} config loaded from file
     * @returns {undefined} nothing
     */
    _init(config) {
        for (const key in config) {
            if ({}.hasOwnProperty.call(config, key)) {
                this[key] = config[key];
            }
        }
    }

};

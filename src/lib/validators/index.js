/*eslint-env node, es6 */

"use strict";

// load core modules
const path = require("path");

// load modules
const restify = require("restify");

// application modules
const packages = require(path.normalize(path.join("..", "packages")));

let self = null; //eslint-disable-line consistent-this

class Validators {

    constructor() {
        if (self === null) {
            self = this;
            self.requiredParameterList = [ "type", "dist", "vers", "arch" ];
        }
        return self;
    }

    requiredParameters(req, res, next) {
        const req_id = req.id();
        const errors = [];

        //
        // check for missing required parameters
        //
        for (let i = 0; i < self.requiredParameterList.length; i++) {
            const paramName = self.requiredParameterList[i];

            if (req.params.hasOwnProperty(paramName)) {
                if (req.params[paramName] === null || req.params[paramName].length === 0) { //eslint-disable-line no-magic-numbers
                    errors.push(`A value for '${paramName}' is required`);
                }
            } else {
                errors.push(`'${paramName}' is required`);
            }
        }

        // short-circuit and send back missing required parameters
        if (errors.length) {
            errors.push(`ref id: ${req_id}`);
            return next(new restify.MissingParameterError(errors.join(", ")));
        }

        const osType = req.params.type;
        const osDist = req.params.dist;
        const osVers = req.params.vers;
        const osArch = req.params.arch;

        //
        // check for present but, invalid parameters
        //
        if (!osType.match(/^[a-z\_\-]+$/i)) {
            errors.push(`Invalid OS type name '${osType}'`);
        }

        if (!osDist.match(/^[a-z]+$/i)) {
            errors.push(`Invalid OS distribution name '${osDist}'`);
        }

        if (!osVers.match(/^[0-9\.]+$/)) {
            errors.push(`Invalid OS distribution version '${osVers}'`);
        }

        if (!osArch.match(/^(i386|i686|x86_64|amd64)$/)) {
            errors.push(`Invalid OS architecture '${osArch}'`);
        }

        // short-circuit and send back invalid required parameters
        if (errors.length) {
            errors.push(`ref id: ${req_id}`);
            return next(new restify.InvalidArgumentError(errors.join(", ")));
        }

        if (!packages.isSupported(req.params.dist, req.params.vers, req.params.arch)) {
            return next(new restify.NotFoundError(`${packages.getError(req.params.dist, req.params.vers, req.params.arch)}, ref id: ${req_id}`));
        }

        return next();
    }


    // statsdFlavor(req, res, next) {
    //     const reqId = req.id();
    //     const errors = [];
    //     const paramName = "statsd";
    //
    //     if (req.params.hasOwnProperty(paramName)) {
    //         if (req.params[paramName].length === 0) { //eslint-disable-line no-magic-numbers
    //             errors.push(`A value for '${paramName}' is required`);
    //         }
    //     } else {
    //         errors.push(`'${paramName}' is required`);
    //     }
    //
    //     // short-circuit and send back missing required parameters
    //     if (errors.length) {
    //         errors.push(`ref id: ${reqId}`);
    //         return next(new restify.MissingParameterError(errors.join(", ")));
    //     }
    //
    //     if (!req.params.mode.match(/^(local|remote)$/)) {
    //         errors.push(`Invalid StatsD type '${req.params.statsd}'`);
    //     }
    //
    //     // short-circuit and send back invalid required parameters
    //     if (errors.length) {
    //         errors.push(`ref id: ${reqId}`);
    //         return next(new restify.InvalidArgumentError(errors.join(", ")));
    //     }
    //
    //     return next();
    // }


    agentMode(req, res, next) {
        const reqId = req.id();
        const errors = [];
        const paramName = "mode";

        if (req.params.hasOwnProperty(paramName)) {
            if (req.params[paramName].length === 0) { //eslint-disable-line no-magic-numbers
                errors.push(`A value for '${paramName}' is required`);
            }
        } else {
            errors.push(`'${paramName}' is required`);
        }

        // short-circuit and send back missing required parameters
        if (errors.length) {
            errors.push(`ref id: ${reqId}`);
            return next(new restify.MissingParameterError(errors.join(", ")));
        }

        if (!req.params.mode.match(/^(push|pull)$/)) {
            errors.push(`Invalid Agent mode '${req.params.mode}'`);
        }

        // short-circuit and send back invalid required parameters
        if (errors.length) {
            errors.push(`ref id: ${reqId}`);
            return next(new restify.InvalidArgumentError(errors.join(", ")));
        }

        return next();

    }


    templateId(req, res, next) {
        const reqId = req.id();
        const errors = [];

        if (!req.params.hasOwnProperty("t_cat")) {
            errors.push("A template category is required");
        }

        if (!req.params.hasOwnProperty("t_name")) {
            errors.push("A template name is required");
        }

        // short-circuit and send back missing required parameters
        if (errors.length) {
            errors.push(`ref id: ${reqId}`);
            return next(new restify.MissingParameterError(errors.join(", ")));
        }

        if (!req.params.t_cat.match(/^(check|graph|worksheet)$/i)) {
            errors.push(`Invalid template category '${req.params.t_cat}'`);
        }

        if (!req.params.t_name.match(/^[a-z0-9\_]+$/i)) {
            errors.push(`Invalid template name '${req.params.t_name}'`);
        }

        // short-circuit and send back invalid required parameters
        if (errors.length) {
            errors.push(`ref id: ${reqId}`);
            return next(new restify.InvalidArgumentError(errors.join(", ")));
        }

        return next();
    }

    // configParameters(req, res, next) {
    //     const reqId = req.id();
    //     const errors = [];
    //     let paramName = "id";
    //
    //     if (req.params.hasOwnProperty(paramName)) {
    //         if (req.params[paramName].length === 0) { //eslint-disable-line no-magic-numbers
    //             errors.push("A config ID is required");
    //         }
    //     } else {
    //         errors.push("A config ID is required");
    //     }
    //
    //     // short-circuit and send back missing required parameters
    //     if (errors.length) {
    //         errors.push(`ref id: ${reqId}`);
    //         return next(new restify.MissingParameterError(errors.join(", ")));
    //     }
    //
    //     if (!req.params.id.match(/^(system|statsd)$/i)) {
    //         errors.push(`Invalid config ID '${req.params.id}'`);
    //     }
    //
    //     // short-circuit and send back invalid required parameters
    //     if (errors.length) {
    //         errors.push(`ref id: ${reqId}`);
    //         return next(new restify.InvalidArgumentError(errors.join(", ")));
    //     }
    //
    //     paramName = "mode";
    //     const configId = req.params.id.toLowerCase();
    //
    //     if (req.params.hasOwnProperty(paramName)) {
    //         if (req.params[paramName].length === 0) { //eslint-disable-line no-magic-numbers
    //             errors.push(`A mode is required for config ID ${configId}`);
    //         }
    //     } else {
    //         errors.push(`A mode is required for config ID ${configId}`);
    //     }
    //
    //     // short-circuit and send back missing required parameters
    //     if (errors.length) {
    //         errors.push(`ref id: ${reqId}`);
    //         return next(new restify.MissingParameterError(errors.join(", ")));
    //     }
    //
    //     if (configId === "system") {
    //         if (!req.params.mode.match(/^(push|pull)$/i)) {
    //             errors.push(`Invalid mode '${req.params.mode}' for config ID '${configId}'`);
    //         }
    //     } else if (configId === "statsd") {
    //         if (!req.params.mode.match(/^(local|remote)$/i)) {
    //             errors.push(`Invalid mode '${req.params.mode}' for config ID '${configId}'`);
    //         }
    //     } else {
    //         errors.push(`No known modes for config ID ${configId} `);
    //     }
    //
    //     // short-circuit and send back invalid required parameters
    //     if (errors.length) {
    //         errors.push(`ref id: ${reqId}`);
    //         return next(new restify.InvalidArgumentError(errors.join(", ")));
    //     }
    //
    //     return next();
    // }
}


module.exports = new Validators();

//. END

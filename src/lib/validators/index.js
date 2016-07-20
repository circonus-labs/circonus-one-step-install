/*eslint-env node, es6 */
/*eslint-disable no-param-reassign, no-magic-numbers */

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
            }
            else {
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

        // validate semver (e.g. 14.04, 7.2.1511) and omnios releases (e.g. r151014)
        if (osVers.match(/^[rv]?\d+(\.\d+){0,2}$/)) {
            req.params.ver_info = {
                "clean": osVers.replace(/^[rv]/, ""),
                "major": null,
                "minor": null,
                "patch": null
            };

            const ver_tmp = req.params.ver_info.clean.split(".");

            req.params.ver_info.major = ver_tmp[0];
            if (ver_tmp.length > 1) {
                req.params.ver_info.minor = ver_tmp[1];
            }
            if (ver_tmp.length > 2) {
                req.params.ver_info.patch = ver_tmp[2];
            }
        }
        else {
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

        if (!packages.isSupported(req.params.dist, req.params.ver_info.clean, req.params.arch)) {
            return next(new restify.NotFoundError(`${packages.getError(req.params.dist, req.params.ver_info.clean, req.params.arch)}, ref id: ${req_id}`));
        }

        return next();
    }


    agentMode(req, res, next) {
        const reqId = req.id();
        const errors = [];
        const paramName = "mode";

        if (req.params.hasOwnProperty(paramName)) {
            if (req.params[paramName].length === 0) { //eslint-disable-line no-magic-numbers
                errors.push(`A value for '${paramName}' is required`);
            }
        }
        else {
            errors.push(`'${paramName}' is required`);
        }

        // short-circuit and send back missing required parameters
        if (errors.length) {
            errors.push(`ref id: ${reqId}`);
            return next(new restify.MissingParameterError(errors.join(", ")));
        }

        if (!req.params.mode.match(/^(push|pull|reverse|revonly)$/)) {
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

        if (!req.params.t_cat.match(/^(check|graph|worksheet|dashboard)$/i)) {
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
}


module.exports = new Validators();

//. END

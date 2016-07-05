/*eslint-env node, es6 */

//
// objects being built for json delivery do not use camelcase
//
/*eslint camelcase: [2, {properties: "never"}]*/
/*eslint-disable no-magic-numbers */

"use strict";

// core modules
const path = require("path");
const url = require("url");

// local modules
const restify = require("restify");

// application modules
const settings = require(path.normalize(path.join(__dirname, "..", "settings")));
const packages = require(path.normalize(path.join(__dirname, "..", "packages")));
const templates = require(path.normalize(path.join(__dirname, "..", "templates")));

let self = null; //eslint-disable-line consistent-this

class Handlers {
    constructor() {
        if (self === null) {
            self = this;
            self.basePackageUrl = settings.package_url;
            self.maxSecretLen = 16;
            self.numCryptoBytes = 256;
        }
        return self;
    }


    root(req, res, next) {
        res.cache("public", { maxAge: 300 });
        res.json({
            description: "Circonus One Step Install",
            version: settings.app_version,
            supported: packages.supportedList()
        });
        return next();
    }


    robots(req, res, next) {
        res.set("Content-Type", "text/plain");
        res.send("User-agent: *\nDisallow: /\n");
        return next();
    }


    agentPackage(req, res, next) {
        const packageFileName = packages.getPackage(req.params.dist, req.params.ver_info.clean, req.params.arch);

        if (packageFileName === null) {
            return next(new restify.ResourceNotFoundError(`no package found for specified os. ref id: ${req.id()}`));
        }

        if (req.params.hasOwnProperty("redirect")) {
            res.redirect(url.resolve(self.basePackageUrl, packageFileName), next);
            return next();
        }

        if (req.accepts("json")) {
            res.cache("private", { maxAge: 300 });
            res.json({ package: packageFileName, url: `${settings.package_url}${packageFileName}` });
        }
        else {
            res.set("Content-Type", "text/plain");
            res.cache("private", { maxAge: 300 });
            if (packageFileName.substr(0, 4) === "http") {
                res.send(packageFileName);
            }
            else {
                res.send(`${self.basePackageUrl}${packageFileName}`);
            }
        }
        return next();
    }


    templateList(req, res, next) {
        const list = templates.list(req.params.dist, req.params.ver_info.clean, req.params.arch);

        if (req.accepts("json")) {
            res.cache("private", { maxAge: 300 });
            res.json({ templates: list });
        }
        else {
            res.set("Content-Type", "text/plain");
            res.cache("private", { maxAge: 300 });
            res.send(list.join(" "));
        }

        return next();
    }


    configTemplate(req, res, next) { //eslint-disable-line consistent-return
        const reqId = req.id();

        const template = templates.get(
            req.params.t_cat,
            req.params.t_name,
            req.params.dist,
            req.params.ver_info.clean,
            req.params.arch
        );

        if (template === null) {
            return next(new restify.ResourceNotFoundError(`Unknown template ID '${req.params.t_cat}-${req.params.t_name}', ref id: ${reqId}`));
        }

        res.cache("private", { maxAge: 300 });
        res.json(template);
        return next();

    }


    defaultBroker(req, res, next) {
        const mode = req.params.mode.toLowerCase();
        const brokers = self._getDefaultBrokers();
        let broker = null;
        let brokerIdx = null;
        let brokerId = null;

        if (mode.match(/^(push|trap|httptrap)$/)) {
            if (brokers.hasOwnProperty("httptrap") && brokers.hasOwnProperty("httptrap_default")) {
                broker = brokers.httptrap;
                brokerIdx = brokers.httptrap_default;
            }
        }
        else if (mode.match(/^(pull|reverse|revonly|json)$/)) {
            if (brokers.hasOwnProperty("json") && brokers.hasOwnProperty("json_default")) {
                broker = brokers.json;
                brokerIdx = brokers.json_default;
            }
        }
        else {
            return next(new restify.InvalidArgumentError(`Invalid agent mode specified '${mode}'`));
        }

        if (broker === null) {
            if (brokers.hasOwnProperty("fallback") && brokers.hasOwnProperty("fallback_default")) {
                broker = brokers.fallback;
                brokerIdx = brokers.fallback_default;
            }
        }

        if (broker === null) {
            return next(new restify.InternalServerError(`Invalid broker configuration, could not satisfy query for '${mode}'.`));
        }

        if (brokerIdx === -1) {
            brokerId = broker[ Math.floor(Math.random() * broker.length) ];
        }
        else {
            brokerId = broker[brokerIdx];
        }

        res.cache("private", { maxAge: 0 });
        res.json({ broker_id: brokerId });
        return next();
    }


    defaultBrokers(req, res, next) {
        const brokers = self._getDefaultBrokers();

        res.cache("private", { maxAge: 0 });
        res.json(brokers);
        return next();
    }


    _getDefaultBrokers() {
        const brokers = { fallback: null, json: null, httptrap: null };
        const checkTypes = Object.keys(brokers);

        for (let i = 0; i < checkTypes.length; i++) {
            const checkType = checkTypes[i];
            const idxKey = `${checkType}_default`;

            if (settings.default_broker_list.hasOwnProperty(checkType)) {
                if (settings.default_broker_list.hasOwnProperty(idxKey)) {
                    const brokerIdx = settings.default_broker_list[idxKey];

                    if (brokerIdx === -1) {
                        brokers[checkType] = Math.floor(Math.random() * settings.default_broker_list[checkType].length);
                    }
                    else {
                        brokers[checkType] = settings.default_broker_list[checkType][brokerIdx];
                    }
                }
            }
        }

        return brokers;
    }

}

module.exports = new Handlers();

// END

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
        const broker = { broker_id: null };
        const brokers = this._defaultBrokers();

        if (mode === "push") {
            broker.broker_id = brokers.push;
        }
        else if (req.params.mode.toLowerCase() === "pull") {
            broker.broker_id = brokers.pull;
        }
        else if (req.params.mode.toLowerCase() === "reverse") {
            broker.broker_id = brokers.reverse;
        }
        else if (req.params.mode.toLowerCase() === "trap") {
            broker.broker_id = brokers.trap;
        }
        else {
            return next(new restify.InvalidArgumentError(`Invalid agent mode specified '${mode}'`));
        }
        res.cache("private", { maxAge: 0 });
        res.json(broker);
        return next();
    }


    defaultBrokers(req, res, next) {
        const brokers = this._defaultBrokers();

        res.cache("private", { maxAge: 0 });
        res.json(brokers);
        return next();
    }


    _defaultBrokers() {
        const brokers = { push: null, pull: null, reverse: null };
        let defaultId = 0;

        defaultId = settings.default_broker_list.push_default;
        if (defaultId === -1) {
            defaultId = Math.floor(Math.random() * settings.default_broker_list.push.length);
        }
        brokers.push = settings.default_broker_list.push[defaultId];

        defaultId = settings.default_broker_list.pull_default;
        if (defaultId === -1) {
            defaultId = Math.floor(Math.random() * settings.default_broker_list.pull.length);
        }
        brokers.pull = settings.default_broker_list.pull[defaultId];

        defaultId = settings.default_broker_list.reverse_default;
        if (defaultId === -1) {
            defaultId = Math.floor(Math.random() * settings.default_broker_list.reverse.length);
        }
        brokers.reverse = settings.default_broker_list.reverse[defaultId];

        defaultId = settings.default_broker_list.trap_default;
        if (defaultId === -1) {
            defaultId = Math.floor(Math.random() * settings.default_broker_list.trap.length);
        }
        brokers.trap = settings.default_broker_list.trap[defaultId];

        return brokers;
    }

}

module.exports = new Handlers();

// END

/*eslint-env node, es6 */

//
// objects being built for json delivery do not use camelcase
//
/*eslint camelcase: [2, {properties: "never"}]*/

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
        const packageFileName = packages.getPackage(req.params.dist, req.params.vers, req.params.arch);

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
        } else {
            res.set("Content-Type", "text/plain");
            res.cache("private", { maxAge: 300 });
            res.send(`${self.basePackageUrl}${packageFileName}`);
        }
        return next();
    }


//     config(req, res, next) {
//         const reqId = req.id();
//         const osInfo = packages.check(req.params.dist, req.params.vers, req.params.arch);
// /*
//         let ip = req.headers["x-forwarded-for"] ||
//              req.connection.remoteAddress ||
//              req.socket.remoteAddress ||
//              null;
//         let target = "default";
// */
//         let config = {};
//         let checkType = null;
//         const configId = req.params.id.toLowerCase();
//         const mode = req.params.mode.toLowerCase();
//
//         if (!osInfo.isSupported) {
//             return next(new restify.ResourceNotFoundError(`no default configuration found for specified os. ref id: ${reqId}`));
//         }
//
//         if (configId === "system") {
//             // config = osInfo.checkConfigs[configId];
//             config = osInfo.defaultCfg;
//             if (mode === "pull") {
//                 checkType = "json:nad";
//             } else {
//                 checkType = "httptrap";
//             }
//         } else if (configId === "statsd") {
//             // config = osInfo.checkConfigs[configId];
//             config = {
//                 "description": "default StatsD configuration",
//                 "version": "1.0.0",
//                 "check": {
//                     "config": {},
//                     "display_name": "default",
//                     "notes": null,
//                     "period": 60,
//                     "status": "active",
//                     "target": "default",
//                     "tags": [],
//                     "timeout": 10
//                 }
//             };
//             if (mode === "remote") {
//                 checkType = "statsd";
//             } else {
//                 checkType = "httptrap";
//             }
//         } else {
//             checkType = "default";
//         }
//
//         //
//         // pre-fill certain check settings based on what is known
//         //
// /*
//         // check.target - IP of the remote system, unless it is a localhost equivalent
//         if (ip !== null) {
//              // take the first address if ip was derived from x-forwarded-for header.
//              // if there are no commas (ip wasn't from x-forwarded-for) result will
//              // simply be a one element array
//             ip = ip.split(",");
//             if (ip.length) {
//                 target = ip[0];
//             }
//             // don't return 127.0.0.1 or ::1, switch back to default
//             if (target.match(/(127\.0\.0\.1|::1)$/)) {
//                 target = "default";
//             }
//         }
//         config.check.target = target;
//
//         // check.tags - basic os information
//         if (!Array.isArray(config.check.tags)) {
//             config.check.tags = [];
//         }
//         config.check.tags = config.check.tags.concat([
//             "cosi:register",
//             `os:${req.params.type}`,
//             `distro:${req.params.dist}-${req.params.vers}`,
//             `arch:${req.params.arch}`
//         ]);
//         // check.notes - simply indicate it was a cosi type
//         config.check.notes = "cosi:register";
// */
//
//         // check.type and check.config (check.config is tied to the type)
//         config.check.type = checkType;
//         if (checkType === "json:nad") {
//             config.check.config = {
//                 http_version: "1.1",
//                 method: "GET",
//                 payload: "",
//                 port: "default",
//                 read_limit: 0,
//                 url: "default"
//             };
//         } else if (checkType === "httptrap") {
//             config.check.config = {
//                 asynch_metrics: true,
//                 secret: crypto.randomBytes(self.numCryptoBytes).
//                     toString("hex").substr(0, self.maxSecretLen) //eslint-disable-line no-magic-numbers
//             };
//         } else if (checkType === "statsd") {
//             if (config.hasOwnProperty("config")) {
//                 delete config.check.config;
//             }
//         } else {
//             if (config.hasOwnProperty("config")) { //eslint-disable-line no-lonely-if
//                 delete config.check.config;
//             }
//         }
//
//         res.cache("private", { maxAge: 0 });
//         res.json(config);
//         return next();
//     }


    templateList(req, res, next) {
        const list = templates.list(req.params.dist, req.params.vers, req.params.arch);

        if (req.accepts("json")) {
            res.cache("private", { maxAge: 300 });
            res.json({ templates: list });
        } else {
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
            req.params.vers,
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
        let defaultId = 0;

        if (mode === "push") {
            defaultId = settings.default_broker_list.push_default;
            if (defaultId === -1) { //eslint-disable-line no-magic-numbers
                defaultId = Math.floor(Math.random() * settings.default_broker_list.push.length);
            }
            broker.broker_id = settings.default_broker_list.push[defaultId];
        } else if (req.params.mode.toLowerCase() === "pull") {
            defaultId = settings.default_broker_list.pull_default;
            if (defaultId === -1) { //eslint-disable-line no-magic-numbers
                defaultId = Math.floor(Math.random() * settings.default_broker_list.pull.length);
            }
            broker.broker_id = settings.default_broker_list.pull[defaultId];
        } else {
            return next(new restify.InvalidArgumentError(`Invalid agent mode specified '${mode}'`));
        }
        res.cache("private", { maxAge: 0 });
        res.json(broker);
        return next();
    }
}

module.exports = new Handlers();

// END

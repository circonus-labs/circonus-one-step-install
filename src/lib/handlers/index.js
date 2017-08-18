// Copyright 2016 Circonus, Inc. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

//
// objects being built for json delivery do not use camelcase
//

'use strict';

// core modules
const path = require('path');
const url = require('url');

// local modules
// const restify = require('restify');
const rerrors = require('restify-errors');

// application modules
const settings = require(path.normalize(path.join(__dirname, '..', 'settings')));
const packages = require(path.normalize(path.join(__dirname, '..', 'packages')));
const templates = require(path.normalize(path.join(__dirname, '..', 'templates')));

let self = null; // eslint-disable-line consistent-this

class Handlers {

    /**
     * create handlers object
     */
    constructor() {
        if (self === null) {
            self = this;
            self.basePackageUrl = settings.package_url;
            self.maxSecretLen = 16;
            self.numCryptoBytes = 256;
        }

        return self;
    }


    /**
     * handle request for '/'
     * @arg {Object} req request object
     * @arg {Object} res response object
     * @arg {Function} next function in handler chain
     * @returns {Undefined} result from next handler in chain
     */
    root(req, res, next) { // eslint-disable-line class-methods-use-this, no-unused-vars
        res.cache('public', { maxAge: 300 });
        res.json({
            description : 'Circonus One Step Install',
            supported   : packages.supportedList(),
            version     : settings.app_version
        });

        return next();
    }


    /**
     * handle request for '/robots.txt'
     * @arg {Object} req request object
     * @arg {Object} res response object
     * @arg {Function} next function in handler chain
     * @returns {Undefined} result from next handler in chain
     */
    robots(req, res, next) { // eslint-disable-line class-methods-use-this, no-unused-vars
        res.set('Content-Type', 'text/plain');
        res.send('User-agent: *\nDisallow: /\n');

        return next();
    }


    /**
     * handle request for '/package'
     * @arg {Object} req request object
     * @arg {Object} res response object
     * @arg {Function} next function in handler chain
     * @returns {Undefined} result from next handler in chain
     */
    agentPackage(req, res, next) { // eslint-disable-line class-methods-use-this, no-unused-vars
        const packageFileName = packages.getPackage(
            req.params.dist,
            req.params.ver_info.clean,
            req.params.arch
        );

        if (packageFileName === null) {
            return next(new rerrors.ResourceNotFoundError(`no package found for specified os. ref id: ${req.id()}`));
        }

        if ({}.hasOwnProperty.call(req.params, 'redirect')) {
            res.redirect(url.resolve(self.basePackageUrl, packageFileName), next);

            return next();
        }

        if (req.accepts('json')) {
            res.cache('private', { maxAge: 300 });
            res.json({ 'package': packageFileName, 'url': `${settings.package_url}${packageFileName}` });
        } else {
            res.set('Content-Type', 'text/plain');
            res.cache('private', { maxAge: 300 });
            if (packageFileName.substr(0, 4) === 'http') {
                res.send(packageFileName);
            } else {
                res.send(`${self.basePackageUrl}${packageFileName}`);
            }
        }

        return next();
    }


    /**
     * handle request for '/templates'
     * @arg {Object} req request object
     * @arg {Object} res response object
     * @arg {Function} next function in handler chain
     * @returns {Undefined} result from next handler in chain
     */
    templateList(req, res, next) { // eslint-disable-line class-methods-use-this, no-unused-vars
        const list = templates.list(
            req.params.type,
            req.params.dist,
            req.params.ver_info.clean,
            req.params.arch
        );

        if (req.accepts('json')) {
            res.cache('private', { maxAge: 300 });
            res.json({ templates: list });
        } else {
            res.set('Content-Type', 'text/plain');
            res.cache('private', { maxAge: 300 });
            res.send(list.join(' '));
        }

        return next();
    }


    /**
     * handle request for '/template/...'
     * @arg {Object} req request object
     * @arg {Object} res response object
     * @arg {Function} next function in handler chain
     * @returns {Undefined} result from next handler in chain
     */
    configTemplate(req, res, next) { // eslint-disable-line consistent-return, class-methods-use-this, no-unused-vars
        const reqId = req.id();

        const template = templates.get(
            req.params.t_cat,
            req.params.t_name,
            req.params.type,
            req.params.dist,
            req.params.ver_info.clean,
            req.params.arch
        );

        if (template === null) {
            return next(new rerrors.ResourceNotFoundError(`Unknown template ID '${req.params.t_cat}-${req.params.t_name}', ref id: ${reqId}`));
        }

        res.cache('private', { maxAge: 300 });
        res.json(template);

        return next();
    }


    /**
     * handle request for '/broker'
     * @arg {Object} req request object
     * @arg {Object} res response object
     * @arg {Function} next function in handler chain
     * @returns {Undefined} result from next handler in chain
     */
    defaultBroker(req, res, next) { // eslint-disable-line class-methods-use-this, no-unused-vars
        const mode = req.params.mode.toLowerCase();
        const brokers = self._getDefaultBrokers();
        let broker = null;
        let brokerIdx = null;
        let brokerId = null;

        if (mode.match(/^(push|trap|httptrap)$/)) {
            if ({}.hasOwnProperty.call(brokers, 'httptrap') &&
                {}.hasOwnProperty.call(brokers, 'httptrap_default')) {
                broker = brokers.httptrap;
                brokerIdx = brokers.httptrap_default;
            }
        } else if (mode.match(/^(pull|reverse|revonly|json)$/)) {
            if ({}.hasOwnProperty.call(brokers, 'json') &&
                {}.hasOwnProperty.call(brokers, 'json_default')) {
                broker = brokers.json;
                brokerIdx = brokers.json_default;
            }
        } else {
            return next(new rerrors.InvalidArgumentError(`Invalid agent mode specified '${mode}'`));
        }

        if (broker === null) {
            if ({}.hasOwnProperty.call(brokers, 'fallback') &&
                {}.hasOwnProperty.call(brokers, 'fallback_default')) {
                broker = brokers.fallback;
                brokerIdx = brokers.fallback_default;
            }
        }

        if (broker === null) {
            return next(new rerrors.InternalServerError(`Invalid broker configuration, could not satisfy query for '${mode}'.`));
        }

        if (brokerIdx === -1) {
            brokerId = broker[Math.floor(Math.random() * broker.length)];
        } else {
            brokerId = broker[brokerIdx];
        }

        res.cache('private', { maxAge: 0 });
        res.json({ broker_id: brokerId });

        return next();
    }


    /**
     * handle request for '/brokers'
     * @arg {Object} req request object
     * @arg {Object} res response object
     * @arg {Function} next function in handler chain
     * @returns {Undefined} result from next handler in chain
     */
    defaultBrokers(req, res, next) { // eslint-disable-line class-methods-use-this, no-unused-vars
        res.cache('private', { maxAge: 0 });
        res.json(self._getDefaultBrokers());

        return next();
    }


    /**
     * private - retrieve list of default brokers
     * @returns {Object} list of default brokers
     */
    _getDefaultBrokers() { // eslint-disable-line class-methods-use-this
        const brokers = {
            fallback : null,
            httptrap : null,
            json     : null
        };
        const checkTypes = Object.keys(brokers);

        for (let i = 0; i < checkTypes.length; i++) {
            const checkType = checkTypes[i];
            const idxKey = `${checkType}_default`;

            if ({}.hasOwnProperty.call(settings.default_broker_list, checkType)) {
                if ({}.hasOwnProperty.call(settings.default_broker_list, idxKey)) {
                    const brokerIdx = settings.default_broker_list[idxKey];

                    if (brokerIdx === -1) {
                        brokers[checkType] = Math.floor(
                            Math.random() * settings.default_broker_list[checkType].length
                        );
                    } else {
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

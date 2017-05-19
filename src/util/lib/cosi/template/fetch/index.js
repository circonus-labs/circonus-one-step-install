// Copyright 2016 Circonus, Inc. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

'use strict';

const assert = require('assert');
const Events = require('events').EventEmitter;
const fs = require('fs');
const path = require('path');
const qs = require('querystring');
const url = require('url');
const https = require('https');
const http = require('http');

const chalk = require('chalk');

const cosi = require(path.resolve(path.resolve(__dirname, '..', '..', '..', 'cosi')));
const Template = require(path.join(cosi.lib_dir, 'template'));
const Metrics = require(path.join(cosi.lib_dir, 'metrics'));

class Fetch extends Events {

    /**
     * create template fetcher class
     * @arg {Boolean} overwrite saved as this.force, determines if existing files are overwritten
     */
    constructor(overwrite) {
        super();

        const query = {
            arch : cosi.cosi_os_arch,
            dist : cosi.cosi_os_dist,
            type : cosi.cosi_os_type,
            vers : cosi.cosi_os_vers
        };

        this.cosiUrl = url.parse(`${cosi.cosi_url}?${qs.stringify(query)}`);

        this.agentUrl = cosi.agent_url;
        this.force = overwrite;
        this.enable_group_check = typeof cosi.cosi_group_id === 'string' && cosi.cosi_group_id !== '';
        this.extraTemplates = [];

        return this;
    }

    /**
     * add an extra or custom template to be fetched
     * @arg {String} name of template
     * @returns {Undefined} nothing
     */
    addExtraTemplate(name) {
        this.extraTemplates.push(name);
    }


    /**
     * fetch template list from cosi-site
     * @arg {Function} cb callback called with list of templates
     * @returns {Undefined} nothing, uses a callback
     */
    list(cb) {
        assert.strictEqual(typeof cb, 'function', 'cb must be a callback function');

        this.cosiUrl.pathname = '/templates';

        const reqOptions = cosi.getProxySettings(url.format(this.cosiUrl));
        let client = null;

        if (reqOptions.protocol === 'https:') {
            client = https;
        } else {
            client = http;
        }


        client.get(reqOptions, (res) => {
            let data = '';

            res.on('data', (chunk) => {
                data += chunk;
            });

            res.on('end', () => {
                if (res.statusCode !== 200) {
                    return cb(new Error(`${res.statusCode} ${res.statusMessage} ${data}`));
                }

                let templates = {};

                try {
                    templates = JSON.parse(data);
                } catch (err) {
                    return cb(err);
                }

                return cb(null, templates);
            });
        }).on('error', (err) => {
            if (err.code === 'ECONNREFUSED') {
                console.error(chalk.red('Fetch template list - unable to connect to COSI'), reqOptions, err.toString());
                process.exit(1); // eslint-disable-line no-process-exit
            }

            return cb(err);
        });
    }

    /**
     * determine if a template exists
     * @arg {String} id of template
     * @returns {Boolean} true if file exists
     */
    exists(id) { // eslint-disable-line class-methods-use-this
        assert.strictEqual(typeof id, 'string', 'id is required');

        const templateFile = path.join(cosi.reg_dir, `template-${id}.json`);
        let stat = null;

        try {
            stat = fs.statSync(templateFile);
        } catch (err) {
            if (err.code !== 'ENOENT') {
                throw err;
            }
        }

        return stat && stat.isFile();
    }


    /**
     * fetch all available templates
     * @arg {Boolean} quiet output
     * @arg {Function} cb callback
     * @returns {Undefined} nothing
     */
    all(quiet, cb) {
        assert.strictEqual(typeof cb, 'function', 'cb must be a callback function');

        const self = this;
        const metrics = new Metrics(`file://${path.join(cosi.reg_dir, 'setup-metrics.json')}`);

        const log = (msg) => {
            if (!quiet) {
                console.log(msg);
            }
        };

        metrics.getGroups((errGroups, groups) => {
            if (errGroups) {
                cb(errGroups);

                return;
            }

            // list of all templates applicable to this host
            const wantTemplates = [ 'check-system', 'worksheet-system' ];

            if (self.enable_group_check) {
                wantTemplates.push('check-group');
            }

            if (self.extraTemplates) {
                for (let i = 0; i < self.extraTemplates.length; i++) {
                    wantTemplates.push(self.extraTemplates[i]);
                }
            }

            for (let i = 0; i < groups.length; i++) {
                wantTemplates.push(`graph-${groups[i]}`);
            }

            // check the templates, to see if they already exist
            const fetchTemplates = [];

            if (self.force) {
                fetchTemplates.push(...wantTemplates);
            } else {
                for (let i = 0; i < wantTemplates.length; i++) {
                    const templateId = wantTemplates[i];

                    if (self.exists(templateId)) {
                        log(`Skipping ${templateId}, template exists, use --force to overwrite.`);
                    } else {
                        log(`Adding ${templateId} to fetch list`);
                        fetchTemplates.push(templateId);
                    }
                }
            }

            if (fetchTemplates.length === 0) {
                cb(null, 'no templates to fetch');

                return;
            }

            log('---');
            log(`Fetching template(s) for: ${fetchTemplates.join(', ')}`);
            log('---');
            self.templates(fetchTemplates, quiet, cb);
        });
    }


    /**
     * fetch specific template
     * @arg {String} id of template
     * @arg {Function} cb callback
     * @returns {Undefined} nothing
     */
    template(id, cb) {
        assert.strictEqual(typeof id, 'string', 'id is required');
        assert.strictEqual(typeof cb, 'function', 'cb must be a callback function');

        const parts = id.split('-');

        if (parts && parts.length === 2) {
            this.cosiUrl.pathname = `/template/${parts[0]}/${parts[1]}`;
        } else {
            cb(new Error(`invalid template id ${id}`));

            return;
        }

        const reqOptions = cosi.getProxySettings(url.format(this.cosiUrl));
        let client = null;

        if (reqOptions.protocol === 'https:') {
            client = https;
        } else {
            client = http;
        }

        client.get(reqOptions, (res) => {
            let data = '';

            res.on('data', (chunk) => {
                data += chunk;
            });

            res.on('end', () => {
                if (res.statusCode !== 200) {
                    const resErr = new Error();

                    resErr.code = res.statusCode;
                    resErr.message = res.statusMessage;
                    resErr.details = JSON.parse(data);

                    cb(resErr);

                    return;
                }

                let template = {};

                try {
                    template = new Template(data);
                } catch (err) {
                    cb(err);

                    return;
                }

                cb(null, template);
            });
        }).on('error', (err) => {
            if (err.code === 'ECONNREFUSED') {
                console.error(chalk.red(`Fetch template ${id} - unable to connect to COSI`), reqOptions, err.toString());
                process.exit(1); // eslint-disable-line no-process-exit
            }

            cb(err);
        });
    }


    /**
     * fetch list of templates
     * @arg {Array} list of templates
     * @arg {Boolean} quiet squelch progress messages
     * @arg {Function} cb callback
     * @returns {Undefined} nothing
     */
    templates(list, quiet, cb) {
        const self = this;
        const attempts = list.length;
        let errors = 0;
        let warnings = 0;
        let fetched = 0;

        const log = (msg) => {
            if (!quiet) {
                console.log(msg);
            }
        };

        this.once('fetch.done', () => {
            self.removeAllListeners('fetch.error');

            cb(null, {
                attempts,
                errors,
                fetched,
                warnings
            });
        });

        this.once('fetch.error', (err) => {
            self.removeAllListeners('fetch.next');
            self.removeAllListeners('fetch.done');
            console.error(chalk.red('Template Fetch Error'), err);

            cb(err, {
                attempts,
                errors,
                fetched,
                warnings
            });
        });

        this.on('fetch.next', () => {
            const templateId = list.shift();

            if (typeof templateId === 'undefined') {
                self.removeAllListeners('fetch.next');
                self.emit('fetch.done');

                return;
            }

            self.template(templateId, (err, template) => {
                if (err) {
                    if (err.code === 404) {
                        console.error(chalk.yellow('WARN'), `Skipping ${templateId}, no COSI template available.`);
                        warnings += 1;
                        self.emit('fetch.next');
                    } else {
                        errors += 1;
                        self.emit('fetch.error', err);
                    }

                    return;
                }

                fetched += 1;

                const parts = templateId.split('-');

                template.id = parts[1]; // eslint-disable-line no-param-reassign
                template.type = parts[0]; // eslint-disable-line no-param-reassign

                const templateFile = path.join(cosi.reg_dir, `template-${templateId}.json`);

                if (template.save(templateFile, self.force)) {
                    log(`Saved template: ${templateFile}`);
                }

                self.emit('fetch.next');
            });
        });

        this.emit('fetch.next');
    }

}

module.exports = Fetch;

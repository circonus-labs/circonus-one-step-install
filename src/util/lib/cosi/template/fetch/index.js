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
     * @returns {Object} promise
     */
    list() {
        return new Promise((resolve, reject) => {
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
                        reject(new Error(`${res.statusCode} ${res.statusMessage} ${data}`));

                        return;
                    }

                    let templates = {};

                    try {
                        templates = JSON.parse(data);
                    } catch (err) {
                        reject(err);

                        return;
                    }

                    resolve(templates);
                });
            }).on('error', (err) => {
                if (err.code === 'ECONNREFUSED') {
                    console.error(chalk.red('Fetch template list - unable to connect to COSI'), reqOptions, err.toString());
                    process.exit(1); // eslint-disable-line no-process-exit
                }

                reject(err);
            });
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
     * @returns {Object} promise
     */
    all(quiet) {
        return new Promise((resolve, reject) => {
            const metrics = new Metrics(`file://${path.join(cosi.reg_dir, 'setup-metrics.json')}`);

            const log = (msg) => {
                if (!quiet) {
                    console.log(msg);
                }
            };

            metrics.getGroups().
                then((groups) => {
                    // list of all templates applicable to this host
                    const wantTemplates = [
                        'check-system', 'worksheet-system'
                        'graph-use_cpu', 'graph-use_vm'
                    ];

                    if (this.enable_group_check) {
                        wantTemplates.push('check-group');
                    }

                    if (this.extraTemplates) {
                        for (const templateId of this.extraTemplates) {
                            wantTemplates.push(templateId);
                        }
                    }

                    for (const group of groups) {
                        wantTemplates.push(`graph-${group}`);
                    }

                    // check the templates, to see if they already exist
                    let fetchTemplates = [];

                    if (this.force) {
                        fetchTemplates = wantTemplates;
                    } else {
                        for (const templateId of wantTemplates) {
                            if (this.exists(templateId)) {
                                log(`Skipping ${templateId}, template exists, use --force to overwrite.`);
                            } else {
                                log(`Adding ${templateId} to fetch list`);
                                fetchTemplates.push(templateId);
                            }
                        }
                    }

                    if (fetchTemplates.length === 0) {
                        resolve('no templates to fetch');

                        return;
                    }

                    log('---');
                    log(`Fetching template(s) for: ${fetchTemplates.join(', ')}`);
                    log('---');

                    this.templates(fetchTemplates, quiet).
                        then((result) => {
                            resolve(result);
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
     * fetch specific template
     * @arg {String} id of template
     * @returns {Object} promise
     */
    template(id) {
        assert.strictEqual(typeof id, 'string', 'id is required');

        return new Promise((resolve, reject) => {
            const parts = id.split('-');

            if (parts && parts.length === 2) {
                this.cosiUrl.pathname = `/template/${parts[0]}/${parts[1]}`;
            } else {
                reject(new Error(`invalid template id ${id}`));

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
                        resErr.options = reqOptions;

                        reject(resErr);

                        return;
                    }

                    let template = {};

                    try {
                        template = new Template(data);
                    } catch (err) {
                        reject(err);

                        return;
                    }

                    resolve(template);
                });
            }).on('error', (err) => {
                if (err.code === 'ECONNREFUSED') {
                    console.error(chalk.red(`Fetch template ${id} - unable to connect to COSI`), reqOptions, err.toString());
                    process.exit(1); // eslint-disable-line no-process-exit
                }

                reject(err);
            });
        });
    }


    /**
     * fetch list of templates
     * @arg {Array} list of templates
     * @arg {Boolean} quiet squelch progress messages
     * @returns {Object} promise
     */
    templates(list, quiet) {
        return new Promise((resolve, reject) => {
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

                resolve({
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

                reject(err);
                // {
                // attempts,
                // errors,
                // fetched,
                // warnings
                // }
            });

            this.on('fetch.next', () => {
                const templateId = list.shift();

                if (typeof templateId === 'undefined') {
                    self.removeAllListeners('fetch.next');
                    self.emit('fetch.done');

                    return;
                }

                self.template(templateId).
                    then((template) => {
                        fetched += 1;

                        const parts = templateId.split('-');

                        template.id = parts[1]; // eslint-disable-line no-param-reassign
                        template.type = parts[0]; // eslint-disable-line no-param-reassign

                        const templateFile = path.join(cosi.reg_dir, `template-${templateId}.json`);

                        if (template.save(templateFile, self.force)) {
                            log(`Saved template: ${templateFile}`);
                        }

                        self.emit('fetch.next');
                    }).
                    catch((err) => {
                        if (err.code === 404) {
                            console.error(chalk.yellow('WARN'), `Skipping ${templateId}, no COSI template available.`);
                            warnings += 1;
                            self.emit('fetch.next');
                        } else {
                            errors += 1;
                            self.emit('fetch.error', err);
                        }
                    });
            });

            this.emit('fetch.next');
        });
    }

}

module.exports = Fetch;

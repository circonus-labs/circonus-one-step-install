// Copyright 2016 Circonus, Inc. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const chalk = require('chalk');

const cosi = require(path.resolve(path.resolve(__dirname, '..', '..', '..', 'cosi')));
const api = require(path.resolve(cosi.lib_dir, 'api'));
const Broker = require(path.join(cosi.lib_dir, 'broker'));
const Metrics = require(path.join(cosi.lib_dir, 'metrics'));
const Registration = require(path.resolve(cosi.lib_dir, 'registration'));
const TemplateFetcher = require(path.join(cosi.lib_dir, 'template', 'fetch'));

class Setup extends Registration {


    /**
     * create worksheet object
     * @arg {Boolean} quiet squelch some info messages
     */
    constructor(quiet) {
        super(quiet);

        this.metricGroups = [];
        this.bh = new Broker(this.quiet);
    }

    /**
     * setup the registration process
     * @returns {Undefined} nothing
     */
    setup() {
        return new Promise((resolve, reject) => {
            console.log(chalk.bold('Registration - setup'));

            this.verifyCirconusAPI().
                then(() => {
                    return this.setTarget();
                }).
                then(() => {
                    return this.getBrokers();
                }).
                then(() => {
                    return this.saveRegConfig();
                }).
                then(() => {
                    return this.fetchNADMetrics();
                }).
                then((metrics) => {
                    return this.saveMetrics(metrics);
                }).
                then(() => {
                    return this.fetchTemplates();
                }).
                then(() => {
                    this.regConfig.setup_done = true;

                    resolve();
                }).
                catch((err) => {
                    reject(err);
                });
        });
    }

    /**
     * verify access to circonus api (api token key and api token app)
     * @returns {Object} promise
     */
    verifyCirconusAPI() {
        const self = this;

        return new Promise((resolve, reject) => {
            console.log(chalk.blue(this.marker));
            console.log('Verify Circonus API access');

            const credentialTroubleshooting = `Check credentials in ${cosi.etc_dir}/cosi.json. Verify they are correct and work with the Circonus API.`;

            api.get('/account/current', null).
                then((result) => {
                    if (result.code !== 200) {
                        const err = new Error('UNEXPECTED_API_RETURN');

                        err.code = result.code;
                        err.body = result.parsed_body;
                        err.raw_body = result.raw_body;

                        if (result.code === 403) {
                            err.troubleshooting = credentialTroubleshooting;
                        }

                        reject(err);

                        return;
                    }

                    console.log(chalk.green('API key verified'),
                                'for account',
                                result.parsed_body.name,
                                result.parsed_body.description === null ? '' : `- ${result.parsed_body.description}`);

                    let accountUrl = result.parsed_body._ui_base_url || 'your_account_url';

                    if (accountUrl.substr(-1) === '/') {
                        accountUrl = accountUrl.substr(0, accountUrl.length - 1);
                    }

                    self.regConfig.account = {
                        account_id : result.parsed_body._cid.replace('/account/', ''),
                        name       : result.parsed_body.name,
                        ui_url     : accountUrl
                    };

                    resolve();
                }).
                catch((err) => {
                    if (err) {
                        if (err.http_code === 403) {
                            err.troubleshooting = credentialTroubleshooting; // eslint-disable-line no-param-reassign
                        }
                        reject(err);
                    }
                });
        });
    }

    /**
     * get brokers
     * @returns {Object} promise
     */
    getBrokers() {
        return new Promise((resolve, reject) => {
            console.log(chalk.blue(this.marker));
            console.log('Loading broker information');

            this.bh.getBrokerList().
                then(() => {
                    return this.bh.getDefaultBrokerList();
                }).
                then(() => {
                    return this.getJsonBroker();
                }).
                then(() => {
                    return this.getTrapBroker();
                }).
                then(() => {
                    resolve();
                }).
                catch((err) => {
                    reject(err);
                });
        });
    }

    /**
     * fetch available metrics from running nad process
     * @returns {Object} promise
     */
    fetchNADMetrics() {
        return new Promise((resolve, reject) => {
            console.log(chalk.blue(this.marker));
            console.log('Fetch available metrics from NAD');

            const metrics = new Metrics(cosi.agent_url);

            metrics.load().
                then(() => {
                    console.log(chalk.green('Metrics loaded'));

                    return metrics.getMetricStats();
                }).
                then((stats) => {
                    let totalMetrics = 0;

                    for (const group in stats) {
                        if ({}.hasOwnProperty.call(stats, group)) {
                            console.log(`\t ${group} has ${stats[group]} metrics`);
                            totalMetrics += stats[group];
                        }
                    }

                    console.log(`Total metrics: ${totalMetrics}`);
                    resolve(metrics);
                }).
                catch((errStats) => {
                    reject(errStats);
                });
        });
    }

    /**
     * saves the metrics fetched from nad
     * @arg {Object} metrics fetched from nad
     * @returns {Object} promise
     */
    saveMetrics(metrics) {
        assert.equal(typeof metrics, 'object', 'metrics is required');

        return new Promise((resolve, reject) => {
            console.log('Saving available metrics');

            metrics.getMetrics().
                then((agentMetrics) => {
                    fs.writeFile(
                        this.regConfig.metricsFile,
                        JSON.stringify(agentMetrics, null, 4), {
                            encoding : 'utf8',
                            flag     : 'w',
                            mode     : 0o600
                        },
                        (errSave) => {
                            if (errSave) {
                                reject(errSave);

                                return;
                            }
                            console.log(chalk.green('Metrics saved', this.regConfig.metricsFile));
                            resolve();
                        }
                    );
                }).
                catch((err) => {
                    reject(err);
                });
        });
    }


    /**
     * fetch available templates from cosi-site
     * @returns {Object} promise
     */
    fetchTemplates() {
        return new Promise((resolve, reject) => {
            console.log(chalk.blue(this.marker));
            console.log('Fetching templates');

            // DO NOT force in register, if templates have been provisioned
            // locally in the registration directory, use them rather than the cosi defaults
            const templateFetch = new TemplateFetcher(false);

            templateFetch.all(this.quiet).
                then((result) => {
                    console.log(`Checked ${result.attempts}, fetched ${result.fetched}, warnings ${result.warnings}, errors ${result.errors}`);
                    resolve();
                }).
                catch((err) => {
                    reject(err);
                });
        });
    }


    /**
     * get default broker for json checks
     * @returns {Object} promise
     */
    getJsonBroker() {
        return new Promise((resolve, reject) => {
            console.log(chalk.blue(this.marker));
            console.log('Determine default broker for json');

            this.bh.getDefaultBroker('json').
                then((broker) => {
                    this.regConfig.broker.json = JSON.parse(JSON.stringify(broker));
                    resolve();
                }).
                catch((err) => {
                    reject(err);
                });
        });
    }


    /**
     * gets the default HTTPTRAP broker
     * @returns {Object} promise
     */
    getTrapBroker() {
        return new Promise((resolve, reject) => {
            console.log(chalk.blue(this.marker));
            console.log('Determine default broker for trap');

            this.bh.getDefaultBroker('httptrap').
                then((broker) => {
                    this.regConfig.broker.trap = JSON.parse(JSON.stringify(broker));
                    resolve();
                }).
                catch((err) => {
                    reject(err);
                });
        });
    }

    /**
     * sets check target
     * @returns {Object} promise
     */
    setTarget() {
        const self = this;

        return new Promise((resolve, reject) => {
            console.log(chalk.blue(self.marker));
            console.log('Setting check target');

            if ({}.hasOwnProperty.call(cosi, 'cosi_host_target') && cosi.cosi_host_target !== '') {
                console.log(chalk.green('Using target from command line:'), cosi.cosi_host_target);
                self.regConfig.templateData.host_target = cosi.cosi_host_target;
                resolve();

                return;
            }

            if ({}.hasOwnProperty.call(cosi.custom_options, 'host_target') && cosi.custom_options.host_target) {
                console.log(chalk.green('Found custom host_target:'), cosi.custom_options.host_target);
                self.regConfig.templateData.host_target = cosi.custom_options.host_target;
                resolve();

                return;
            }

            if (self.agentMode === 'reverse') {
                // this is what NAD will use to find the check to get reverse url
                self.regConfig.templateData.host_target = os.hostname();
                console.log(chalk.green('Reverse agent'), 'using', self.regConfig.templateData.host_target);
                resolve();

                return;
            }

            if (self.agentMode === 'revonly') {
                // this is what NAD will use to find the check to get reverse url
                // if a reverse connection fails, the broker would ordinarily resort to attempting to
                // *pull* metrics. the target needs to be non-resolvable to prevent the broker accidentally
                // pulling metrics from an unintended target that happens to be reachable
                self.regConfig.templateData.host_target = `REV:${os.hostname()}`;
                console.log(chalk.green(`Reverse ${chalk.bold('ONLY')} agent`), self.regConfig.templateData.host_target);
                resolve();

                return;
            }


            self._getDefaultHostIp().
                then((target) => {
                    console.log(chalk.green('Target ip/host:'), target);
                    self.regConfig.templateData.host_target = target;
                    resolve();
                }).
                catch((err) => {
                    reject(err);
                });
        });
    }


    /**
     * deterive the systems IP
     * @returns {Object} promise
     */
    _getDefaultHostIp() {
        const self = this;

        return new Promise((resolve, reject) => {
            self._checkAWS().
                then((awsHostname) => {
                    if (awsHostname !== null) {
                        resolve(awsHostname);

                        return;
                    }

                    console.log('Obtaining target IP/Host from local information');

                    const networkInterfaces = os.networkInterfaces();

                    for (const iface in networkInterfaces) {
                        if ({}.hasOwnProperty.call(networkInterfaces, iface)) {
                            for (const addr of networkInterfaces[iface]) {
                                if (!addr.internal && addr.family === 'IPv4') {
                                    resolve(addr.address);

                                    return;
                                }
                            }
                        }
                    }

                    resolve('0.0.0.0');
                }).
                catch((err) => {
                    // technically, checkAWS doesn't reject with an error
                    // it *always* resolves with a value which is handled above
                    reject(err);
                });
        });
    }

    /**
     * determine if system is running in AWS
     * @returns {Object} promise
     */
    _checkAWS() { // eslint-disable-line class-methods-use-this
        return new Promise((resolve) => {
            // ONLY make this request if dmiinfo contains 'amazon'
            // no reason to wait for a timeout otherwise
            if (!{}.hasOwnProperty.call(cosi, 'dmi_bios_ver') || !cosi.dmi_bios_ver.match(/amazon/i)) {
                resolve(null);

                return;
            }

            console.log('Checking AWS for target (public ip/hostname for host)');

            // from aws docs: http://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ec2-instance-metadata.html
            http.get('http://169.254.169.254/latest/meta-data/public-hostname', (res) => {
                let data = '';

                res.on('data', (chunk) => {
                    data += chunk;
                });

                res.on('end', () => {
                    if (res.statusCode === 200) {
                        const hostnames = data.split(/\r?\n/); // or os.EOL but it's a web response not a file

                        if (hostnames.length > 0) {
                            resolve(hostnames[0]);

                            return;
                        }
                    }

                    resolve(null);
                });
            }).on('error', () => {
                // just punt, use the default "dumb" logic
                resolve(null);
            });
        });
    }

}

module.exports = Setup;

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
    }

    /**
     * setup the registration process
     * @returns {Undefined} nothing
     */
    setup() {
        console.log(chalk.bold('Registration - setup'));

        const self = this;

        this.once('verify.api', this.verifyCirconusAPI);
        this.once('verify.api.done', () => {
            self.emit('default.target');
        });

        this.once('default.target', this.setTarget);
        this.once('default.target.done', () => {
            self.emit('broker.load');
        });

        this.once('broker.load', () => {
            console.log(chalk.blue(self.marker));
            console.log('Loading broker information');

            const bh = new Broker(self.quiet);

            bh.getBrokerList((errGBL) => {
                if (errGBL) {
                    console.error(chalk.red('ERROR:'), 'Fetching broker list from API', errGBL);
                    process.exit(1);
                }
                bh.getDefaultBrokerList((errGDBL) => {
                    if (errGDBL) {
                        console.error(chalk.red('ERROR:'), 'Fetching broker list from API', errGDBL);
                        process.exit(1);
                    }
                    self.emit('broker.json');
                });
            });
        });

        this.once('broker.json', this.getJsonBroker);
        this.once('broker.json.done', () => {
            self.emit('broker.trap');
        });

        this.once('broker.trap', this.getTrapBroker);
        this.once('broker.trap.done', () => {
            self.emit('save.config');
        });

        this.once('save.config', () => {
            self.regConfig.setup_done = true;
            self.saveRegConfig();
            self.emit('metrics.fetch');
        });

        this.once('metrics.fetch', this.fetchNADMetrics);
        this.once('metrics.fetch.save', this.saveMetrics);
        this.once('metrics.fetch.done', () => {
            self.emit('templates.fetch');
        });

        this.once('templates.fetch', this.fetchTemplates);
        this.once('templates.fetch.done', () => {
            self.emit('setup.done');
        });


        this.emit('verify.api');
    }

    /**
     * verify access to circonus api (api token key and api token app)
     * @returns {Undefined} nothing
     */
    verifyCirconusAPI() {
        console.log(chalk.blue(this.marker));
        console.log('Verify Circonus API access');

        const self = this;

        const credentialTroubleshooting = `Check credentials in ${cosi.etc_dir}/cosi.json. Verify they are correct and work with the Circonus API.`;

        api.setup(cosi.api_key, cosi.api_app, cosi.api_url);
        api.get('/account/current', null, (code, err, account) => {
            if (err) {
                if (code === 403) {
                    err.troubleshooting = credentialTroubleshooting; // eslint-disable-line no-param-reassign
                }
                self.emit('error', err);

                return;
            }

            if (code !== 200) {
                const apiError = new Error(`verifyAPI - API return code: ${code} ${err} ${account}`);

                if (code === 403) {
                    apiError.troubleshooting = credentialTroubleshooting;
                }

                self.emit('error', apiError);
            }

            console.log(chalk.green('API key verified'), 'for account', account.name, account.description === null ? '' : `- ${account.description}`);

            let accountUrl = account._ui_base_url || 'your_account_url';

            if (accountUrl.substr(-1) === '/') {
                accountUrl = accountUrl.substr(0, accountUrl.length - 1);
            }

            self.regConfig.account = {
                account_id : account._cid.replace('/account/', ''),
                name       : account.name,
                ui_url     : accountUrl
            };

            self.emit('verify.api.done');
        });
    }


    /**
     * fetch available metrics from running nad process
     * @returns {Undefined} nothing
     */
    fetchNADMetrics() {
        console.log(chalk.blue(this.marker));
        console.log('Fetch available metrics from NAD');

        const self = this;
        const metrics = new Metrics(cosi.agent_url);

        metrics.load((err) => {
            if (err) {
                self.emit('error', err);

                return;
            }
            console.log(chalk.green('Metrics loaded'));
            metrics.getMetricStats((metricStatsError, stats) => {
                if (metricStatsError) {
                    self.emit('error', metricStatsError);
                }

                let totalMetrics = 0;

                for (const group in stats) {
                    if ({}.hasOwnProperty.call(stats, group)) {
                        console.log(`\t ${group} has ${stats[group]} metrics`);
                        totalMetrics += stats[group];
                    }
                }

                console.log(`Total metrics: ${totalMetrics}`);
                self.emit('metrics.fetch.save', metrics);
            });
        });
    }

    /**
     * saves the metrics fetched from nad
     * @arg {Object} metrics fetched from nad
     * @returns {Undefined} nothing
     */
    saveMetrics(metrics) {
        assert.equal(typeof metrics, 'object', 'metrics is required');

        console.log('Saving available metrics');

        const self = this;

        metrics.getMetrics((metricsError, agentMetrics) => {
            if (metricsError) {
                self.emit('error', metricsError);

                return;
            }
            fs.writeFile(
                self.regConfig.metricsFile,
                JSON.stringify(agentMetrics, null, 4), {
                    encoding : 'utf8',
                    flag     : 'w',
                    mode     : 0o600
                },
                (saveError) => {
                    if (saveError) {
                        self.emit('error', saveError);

                        return;
                    }
                    console.log(chalk.green('Metrics saved', self.regConfig.metricsFile));
                    self.emit('metrics.fetch.done');
                }
            );
        });
    }


    /**
     * fetch available templates from cosi-site
     * @returns {Undefined} nothing
     */
    fetchTemplates() {
        console.log(chalk.blue(this.marker));
        console.log('Fetching templates');

        const self = this;

        // DO NOT force in register, if templates have been provisioned, use them
        const templateFetch = new TemplateFetcher(false);

        templateFetch.all(this.quiet, (err, result) => {
            if (err) {
                self.emit('error', err);

                return;
            }
            console.log(`Checked ${result.attempts}, fetched ${result.fetched}, warnings ${result.warnings}, errors ${result.errors}`);
            self.emit('templates.fetch.done');
        });
    }


    /**
     * get default broker for json checks
     * @returns {Undefined} nothing
     */
    getJsonBroker() {
        console.log(chalk.blue(this.marker));
        console.log('Determine default broker for json');

        const self = this;
        const bh = new Broker(this.quiet);

        bh.getDefaultBroker('json', (err, broker) => {
            if (err) {
                self.emit('error', err);

                return;
            }

            self.regConfig.broker.json = JSON.parse(JSON.stringify(broker));
            self.emit('broker.json.done');
        });
    }


    /**
     * gets the default HTTPTRAP broker
     * @returns {Undefined} nothing
     */
    getTrapBroker() {
        console.log(chalk.blue(this.marker));
        console.log('Determine default broker for trap');

        const self = this;
        const bh = new Broker(this.quiet);

        bh.getDefaultBroker('httptrap', (err, broker) => {
            if (err) {
                self.emit('error', err);

                return;
            }

            self.regConfig.broker.trap = JSON.parse(JSON.stringify(broker));
            self.emit('broker.trap.done');
        });
    }

    /**
     * sets check target
     * @returns {Undefined} nothing
     */
    setTarget() {
        const self = this;

        console.log(chalk.blue(this.marker));
        console.log('Setting check target');

        if ({}.hasOwnProperty.call(cosi, 'cosi_host_target') && cosi.cosi_host_target !== '') {
            console.log(chalk.green('Using target from command line:'), cosi.cosi_host_target);
            this.regConfig.templateData.host_target = cosi.cosi_host_target;
            this.emit('default.target.done');
        } else if ({}.hasOwnProperty.call(cosi.custom_options, 'host_target') && cosi.custom_options.host_target) {
            console.log(chalk.green('Found custom host_target:'), cosi.custom_options.host_target);
            this.regConfig.templateData.host_target = cosi.custom_options.host_target;
            this.emit('default.target.done');
        } else if (this.agentMode === 'reverse') {
             // this is what NAD will use to find the check to get reverse url
            this.regConfig.templateData.host_target = os.hostname();
            console.log(chalk.green('Reverse agent'), 'using', this.regConfig.templateData.host_target);
            this.emit('default.target.done');
        } else if (this.agentMode === 'revonly') {
             // this is what NAD will use to find the check to get reverse url
             // if a reverse connection fails, the broker would ordinarily resort to attempting to
             // *pull* metrics. the target needs to be non-resolvable to prevent the broker accidentally
             // pulling metrics from an unintended target that happens to be reachable
            this.regConfig.templateData.host_target = `REV:${os.hostname()}`;
            console.log(chalk.green(`Reverse ${chalk.bold('ONLY')} agent`), this.regConfig.templateData.host_target);
            this.emit('default.target.done');
        } else {
            this._getDefaultHostIp((target) => {
                console.log(chalk.green('Target ip/host:'), target);
                self.regConfig.templateData.host_target = target;
                self.emit('default.target.done');
            });
        }
    }


    /**
     * deterive the systems IP
     * @arg {Function} cb callback
     * @returns {Undefined} nothing, uses callback
     */
    _getDefaultHostIp(cb) {
        this._checkAWS((awsHostname) => {
            if (awsHostname !== null) {
                cb(awsHostname);

                return;
            }

            console.log('Obtaining target IP/Host from local information');

            const networkInterfaces = os.networkInterfaces();

            for (const iface in networkInterfaces) {
                if ({}.hasOwnProperty.call(networkInterfaces, iface)) {
                    for (const addr of networkInterfaces[iface]) {
                        if (!addr.internal && addr.family === 'IPv4') {
                            cb(addr.address);

                            return;
                        }
                    }
                }
            }

            cb('0.0.0.0');
        });
    }

    /**
     * determine if system is running in AWS
     * @arg {Function} cb callback
     * @returns {Undefined} nothing, uses callback
     */
    _checkAWS(cb) { // eslint-disable-line class-methods-use-this
        // ONLY make this request if dmiinfo contains 'amazon'
        // no reason to wait for a timeout otherwise
        if (!{}.hasOwnProperty.call(cosi, 'dmi_bios_ver') || !cosi.dmi_bios_ver.match(/amazon/i)) {
            cb(null);

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
                        cb(hostnames[0]);

                        return;
                    }
                }

                cb(null);
            });
        }).on('error', () => {
            // just punt, use the default "dumb" logic
            cb(null);
        });
    }

}

module.exports = Setup;

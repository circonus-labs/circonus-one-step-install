'use strict';

/* eslint-env node, es6 */

const Events = require('events');
const path = require('path');

const chalk = require('chalk');

const cosi = require(path.resolve(path.join(__dirname, '..', '..', '..', 'cosi')));
const Setup = require(path.resolve(path.join(cosi.lib_dir, 'registration', 'setup')));
const Checks = require(path.resolve(path.join(cosi.lib_dir, 'registration', 'checks')));
const Graphs = require(path.resolve(path.join(cosi.lib_dir, 'registration', 'graphs')));
const Worksheets = require(path.resolve(path.join(cosi.lib_dir, 'registration', 'worksheets')));
const Dashboards = require(path.resolve(path.join(cosi.lib_dir, 'registration', 'dashboards')));

class Register extends Events {

    register() {
        console.log(chalk.bold('\nRegistration - creating checks and visuals\n'));

        const self = this;

        this.once('setup', () => {
            const setup = new Setup();

            setup.once('setup.done', () => {
                self.emit('setup.done');
            });
            setup.setup();
        });

        this.once('setup.done', () => {
            self.emit('checks');
        });

        this.once('checks', () => {
            const checks = new Checks();

            checks.create(() => {
                self.emit('checks.done');
            });
        });

        this.once('checks.done', () => {
            self.emit('graphs');
        });


        this.once('graphs', () => {
            const graphs = new Graphs();

            graphs.create(() => {
                self.emit('graphs.done');
            });
        });

        this.once('graphs.done', () => {
            self.emit('worksheets');
        });


        this.once('worksheets', () => {
            const worksheets = new Worksheets();

            worksheets.create(() => {
                self.emit('worksheets.done');
            });
        });

        this.once('worksheets.done', () => {
            self.emit('dashboards');
        });


        this.once('dashboards', () => {
            const dashboards = new Dashboards();

            dashboards.create(() => {
                self.emit('dashboards.done');
            });
        });

        this.once('dashboards.done', () => {
            self.emit('check.update');
        });

        // update check with any new metrics
        this.once('check.update', () => {
            const checks = new Checks();

            checks.update(() => {
                self.emit('update.done');
            });
        });

        this.once('check.update.done', () => {
            self.emit('register.done');
        });

        this.once('register.done', () => {
            console.log(chalk.green('\n\nRegistration complete\n'));
        });

        self.emit('setup');
    }
}

module.exports = Register;

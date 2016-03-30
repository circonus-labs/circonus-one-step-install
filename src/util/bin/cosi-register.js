#!/usr/bin/env node

/*eslint-env node, es6 */
/*eslint-disable no-magic-numbers */

"use strict";

const path = require("path");
const events = require("events");

const app = require("commander");

const cosi = require(path.resolve(path.join(__dirname, "..", "lib", "cosi")));

const RegSetup = require(path.join(cosi.lib_dir, "registration", "setup"));
const RegConfig = require(path.join(cosi.lib_dir, "registration", "config"));
const RegRegister = require(path.join(cosi.lib_dir, "registration", "register"));

const regEvents = new events.EventEmitter();

app.
    version(cosi.app_version).
    option("-q, --quiet", "only error output").
    parse(process.argv);

regEvents.once("setup", () => {
    const regSetup = new RegSetup(app.quiet);

    regSetup.once("setup.done", () => {
        regEvents.emit("config");
    });

    regSetup.setup();
});


regEvents.once("config", () => {
    const regConfig = new RegConfig(app.quiet);

    regConfig.once("config.done", () => {
        regEvents.emit("register");
    });

    regConfig.config();
});


regEvents.once("register", () => {
    const regRegister = new RegRegister(app.quiet);

    regRegister.once("register.done", () => {
        regEvents.emit("done");
    });

    regRegister.register();
});


// start registration process

regEvents.emit("setup");

// END

#!/usr/bin/env node

/*eslint-env node, es6 */
/*eslint-disable no-magic-numbers */

"use strict";

const path = require("path");
// const events = require("events");

const app = require("commander");

const cosi = require(path.resolve(path.join(__dirname, "..", "lib", "cosi")));

// const Plugin = require(path.join(cosi.lib_dir, "plugins"));
//
// const pluginEvents = new events.EventEmitter();
//
// let pluginName;
// let pluginOptions;

app.
    version(cosi.app_version).
    command("postgres", "Manage PostgreSQL plugin").
    option("-q, --quiet", "less output").
    parse(process.argv);
    // allowUnknownOption(true).
    // action((plugin, pluginArgs) => {
    //     pluginName = plugin;
    //     pluginOptions = pluginArgs.rawArgs;
    // });
// app.parse(process.argv);

// pluginEvents.once("run", () => {
//     if (app.enable && app.disable) {
//         console.log("Please use either --enable or --disable, not both");
//         return;
//     }
//
//     const pluginPath = path.join(cosi.lib_dir, "plugins", pluginName);
//     const pluginClass = require(pluginPath);
//     if (!pluginClass) {
//         console.log("Can not locate plugin: " + app.plugin);
//         return;
//     }
//
//     const plugin = new pluginClass(app.quiet, pluginOptions);
//
//     plugin.once("plugin.done", () => {
//         pluginEvents.emit("done");
//     });
//
//     if (app.enable) {
//         plugin.enable();
//     } else {
//         plugin.disable();
//     }
// });
//
// pluginEvents.emit("run");

// END

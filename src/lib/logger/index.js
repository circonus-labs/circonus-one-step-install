/*eslint-env node, es6 */

"use strict";

// load core modules
const path = require("path");

// load local modules
const bunyan = require("bunyan");

// load app modules
const settings = require(path.normalize(path.join("..", "settings")));

let instance = null;

function init_logger() {

    if (instance !== null) {
        return instance;
    }

    const app_name = settings.app_name;
    const log_level = settings.log_level;
    const log_dir = settings.log_dir;

    if (log_dir === settings.CONSOLE_LOG) {
        instance = bunyan.createLogger({
            name: app_name,
            level: log_level
        });
    } else {
        // note, two streams because file streams do NOT get
        // flushed on process.exit. cause messages are lost.
        instance = bunyan.createLogger({
            name: app_name,
            streams: [
                {
                    level: "fatal",
                    stream: process.stderr
                },
                {
                    level: log_level,
                    type: "rotating-file",
                    path: path.join(log_dir, `${app_name}.log`),
                    period: settings.log_rotation,
                    count: settings.log_save
                }
            ]
        });
        process.on("SIGHUP", () => { instance.reopenFileStreams(); });
    }

    return instance;
}

module.exports = init_logger();

// END

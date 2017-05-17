'use strict';

// load core modules
const path = require('path');

// load local modules
const bunyan = require('bunyan');

// load app modules
const settings = require(path.normalize(path.join('..', 'settings')));

let instance = null;

/**
 * initialize logger
 * @returns {Object} logger instance
 */
function init_logger() {
    if (instance !== null) {
        return instance;
    }

    const app_name = settings.app_name;
    const log_level = settings.log_level;
    const log_dir = settings.log_dir;

    if (log_dir === settings.CONSOLE_LOG) {
        instance = bunyan.createLogger({
            level : log_level,
            name  : app_name
        });
    } else {
        // note, two streams because file streams do NOT get
        // flushed on process.exit. cause messages are lost.
        instance = bunyan.createLogger({
            name    : app_name,
            streams : [
                {
                    level  : 'fatal',
                    stream : process.stderr
                },
                {
                    count  : settings.log_save,
                    level  : log_level,
                    path   : path.join(log_dir, `${app_name}.log`),
                    period : settings.log_rotation,
                    type   : 'rotating-file'
                }
            ]
        });
        process.on('SIGHUP', () => {
            instance.reopenFileStreams();
        });
    }

    return instance;
}

module.exports = init_logger();

// END

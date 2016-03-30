/*eslint-env node, es6 */
/*eslint-disable no-magic-numbers */

"use strict";

module.exports.info = function(msg) {
    const dte = new Date();

    console.log(`${dte.toISOString()} INFO ${msg}`);
};

module.exports.warn = function(msg) {
    const dte = new Date();

    console.warn(`${dte.toISOString()} WARN ${msg}`);
};

module.exports.error = function(msg) {
    const dte = new Date();

    console.error(`${dte.toISOString()} ERROR ${msg}`);
};

// END

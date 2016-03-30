"use strict";

/*eslint-env node, es6 */
/*eslint-disable no-magic-numbers, no-process-exit */

const path = require("path");
const fs = require("fs");

const chalk = require("chalk");

const cosi = require(path.resolve(path.join(__dirname, "..", "..")));
const Check = require(path.resolve(path.join(cosi.lib_dir, "check")));

module.exports = function buildCheckList() {
    const checks = [];
    let files = null;

    try {
        files = fs.readdirSync(cosi.reg_dir);
    }
    catch (err) {
        console.error(chalk.red("ERROR accessing registration directory"));
        console.dir(err, { colors: true });
        process.exit(1);
    }

    for (let i = 0; i < files.length; i++) {
        const file = files[i];

        if (file.match(/^registration-check-.*\.json$/)) {
            const id = file.replace("registration-", "").replace(".json", "");

            try {
                checks.push({
                    id,
                    file,
                    config: new Check(path.resolve(path.join(cosi.reg_dir, file)))
                });
            }
            catch (err) {
                console.error(chalk.yellow("WARN unable to add check to list"));
                console.dir(err, { colors: true });
            }
        }
    }

    return checks;
};

// END

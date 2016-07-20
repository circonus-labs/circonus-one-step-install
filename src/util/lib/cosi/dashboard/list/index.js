"use strict";

/*eslint-env node, es6 */
/*eslint-disable no-magic-numbers, no-process-exit */

const path = require("path");
const fs = require("fs");

const chalk = require("chalk");

const cosi = require(path.resolve(path.join(__dirname, "..", "..")));
const Dashboard = require(path.resolve(path.join(cosi.lib_dir, "dashboard")));

function buildDashboardList() {
    const dashboards = [];
    let files = null;

    try {
        files = fs.readdirSync(cosi.reg_dir);
    }
    catch (err) {
        console.error(chalk.red("ERROR accessing registration directory"));
        console.dir(err, { colors: true });
        process.exit(1);
    }

    // for (const file of files) {
    for (let i = 0; i < files.length; i++) {
        const file = files[i];

        if (file.match(/^registration-dashboard-.*\.json$/)) {
            const id = file.replace("registration-", "").replace(".json", "");

            try {
                dashboards.push({
                    id,
                    file,
                    config: new Dashboard(path.resolve(path.join(cosi.reg_dir, file)))
                });
            }
            catch (err) {
                console.error(chalk.yellow("WARN unable to add dashboard to list"));
                console.dir(err, { colors: true });
            }
        }
    }

    return dashboards;
}

module.exports = buildDashboardList;

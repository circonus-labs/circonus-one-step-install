"use strict";

/*eslint-env node, es6 */
/*eslint-disable no-magic-numbers, no-process-exit */

const path = require("path");
const fs = require("fs");

const chalk = require("chalk");

const cosi = require(path.resolve(path.join(__dirname, "..", "..")));
const Graph = require(path.resolve(path.join(cosi.lib_dir, "graph")));

function buildGraphList() {
    const graphs = [];
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

        if (file.match(/^registration-graph-.*\.json$/)) {
            const id = file.replace("registration-", "").replace(".json", "");

            try {
                graphs.push({
                    id,
                    file,
                    config: new Graph(path.resolve(path.join(cosi.reg_dir, file)))
                });
            }
            catch (err) {
                console.error(chalk.yellow("WARN unable to add graph to list"));
                console.dir(err, { colors: true });
            }
        }
    }

    return graphs;
}

module.exports = buildGraphList;

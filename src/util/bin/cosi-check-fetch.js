#!/usr/bin/env node

/*eslint-env node, es6 */
/*eslint-disable no-magic-numbers */

"use strict";

const path = require("path");
const fs = require("fs");

const app = require("commander");
const chalk = require("chalk");
const api = require("circonusapi2");

const cosi = require(path.resolve(path.join(__dirname, "..", "lib", "cosi")));

const Check = require(path.resolve(path.join(cosi.lib_dir, "check")));

function getCid(id) {
    const cfgName = path.resolve(path.join(cosi.reg_dir, `registration-${id}.json`));
    const check = new Check(cfgName);

    return check._cid;
}

app.
    version(cosi.app_version).
    option("-i, --id <id>", "check ID, see 'cosi check list'. or a check_bundle id from UI").
    option("-k, --check <type>", "check type [system]").
    option("-n, --display_name <name>", "check name to fetch").
    option("-t, --target_host <target>", "check target host (IP|FQDN) to fetch").
    option("-s, --save <file>", "save fetched check to file").
    parse(process.argv);

console.log(chalk.bold(app.name()), `v${app.version()}`);

let criteria = "";
let checkType = app.check;

if (checkType) {
    checkType = app.check.toLowerCase();
} else {
    checkType = "system";
}

let circonusCheckType = checkType;

if (checkType === "system") {
    circonusCheckType = cosi.agent_mode.toLowerCase() === "pull" ? "json:nad" : "httptrap";
}

api.setup(cosi.api_key, cosi.api_app, cosi.api_url);

let urlPath = "/check_bundle";
let query = {
    f_type: circonusCheckType //eslint-disable-line camelcase
};

if (app.display_name) {
    query.f_display_name = app.display_name; //eslint-disable-line camelcase
    criteria = `display_name='${app.display_name}' `;
}

if (app.target_host) {
    query.f_target = app.target_host; //eslint-disable-line camelcase
    criteria += `target='${app.target_host}'`;
}

if (!app.display_name && !app.target_host) {
    query.f_notes_wildcard = `cosi:register*cosi_id:${cosi.cosi_id}*`; //eslint-disable-line camelcase
    criteria = `this host's COSI ID (${cosi.cosi_id})`;
}

if (app.id) {
    if (app.id.match(/^[0-9]+$/)) {
        urlPath += `/${app.id}`;
    } else {
        urlPath = getCid(app.id);
    }
    query = null;
}

api.get(urlPath, query, (code, err, result) => {
    if (err) {
        console.error(err, code, result);
        throw err;
    }

    if (code !== 200) {
        console.error(code);
        console.dir(result);
    }

    if (result.length === 0) {
        console.error(chalk.red(`No ${checkType} checks found for ${criteria}.`));
        process.exit(1); //eslint-disable-line no-process-exit
    }

    if (app.save) {
        const file = path.resolve(app.save);

        fs.writeFileSync(file, JSON.stringify(result, null, 4));
        console.log(chalk.green("Saved"), `check configuration to ${file}`);
    } else {
        if (Array.isArray(result)) { //eslint-disable-line no-lonely-if
            for (let i = 0; i < result.length; i++) {
                if (result[i].type === circonusCheckType) {
                    console.dir(result[i]);
                }
            }
        } else {
            console.dir(result);
        }
    }


});

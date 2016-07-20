"use strict";

/*eslint-env node, es6 */
/*eslint-disable no-magic-numbers, global-require */

const assert = require("assert");
const Events = require("events").EventEmitter;
const fs = require("fs");
const path = require("path");
const execSync = require("child_process").execSync;

/* just using this to parse argv */
const app = require("commander");

const chalk = require("chalk");

const cosi = require(path.resolve(path.join(__dirname, "..", "..", "..", "cosi")));
const Plugin = require(path.resolve(cosi.lib_dir, "plugins"));


class Postgres extends Plugin {

    constructor(quiet, argv) {
        super(quiet);
        this.name = "postgres";
        this.on("config.postgres", this._configPostgres);
        app.
            version(cosi.app_version).
            option("-e, --enable", "enable the postgres plugin").
            option("-d, --disable", "disable the postgres plugin").
            option("-b, --pgdb [databases]", "comma separated list of databases to enable", "").
            option("-u, --pguser [user]", "the postgres user to run as", "postgres").
            option("-a, --pgpass [pass]", "the pass of the postgres user", "").
            option("-o, --pgport [port]", "port to connect to", 5432).
            parse(argv);
        this.params = app;
    }

    _configPostgres() {
        const self = this;
        /* if we have gotten here, nad-enable.sh has flipped on the postgres plugin and tested it to work */
        console.log("postgres/nad-enable.sh successful");
        
        /* now we need to re-register this box as there are new metrics to collect and graphs to create */
        console.log("NAD portion of plugin complete.  Re-registering this host");
        this.once("register.done", () => {
            self.emit("dashboard.create");
        });

        this.once("dashboard.create", () => {
            self.once("dashboard.done", () => {
                self.emit("plugin.done");
            });
            self.configDashboard("postgres", self.params.quiet, [self.params.pgdb]);
        });

        this.reregisterHost();        
    }

    enable() {
        const self = this;
        this.on("postgres.nad.enabled", (stdout) => {
            self.emit("config.postgres");
        });

        const stdout = execSync('psql -V');
        if (!stdout.indexOf("PostgreSQL") == -1) {
            self.emit("error", "Cannot find 'psql' in your path, postgres nad plugin will not work");
            return;
        }        

        /* write a pg-conf.sh file for the nad plugin to operate..
           this belongs in /opt/circonus/etc/ */
        const pg_conf_file = "/opt/circonus/etc/pg-conf.sh";
        const contents = `#!/bin/bash
        
PGUSER=${self.params.pguser}
PGDATABASE=${self.params.pgdb}        
        `;

        fs.writeFileSync(
            pg_conf_file,
            contents,
            { encoding: "utf8", mode: 0o644, flag: "w" }
        );        

        const script = path.resolve(path.join(__dirname, "nad-enable.sh"));
        
        self._execShell(script, "postgres.nad.enabled");        
    }
}

module.exports = Postgres;


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
const Check = require(path.resolve(cosi.lib_dir, "check"));
const Graph = require(path.resolve(cosi.lib_dir, "graph"));
const Dashboard = require(path.resolve(cosi.lib_dir, "dashboard"));


class Postgres extends Plugin {

    constructor(quiet, argv) {
        super(quiet);
        this.name = "postgres";
        this.on("config.postgres", this._configPostgres);
        app.
            version(cosi.app_version).
            option("-e, --enable", "enable the postgres plugin").
            option("-d, --disable", "disable the postgres plugin").
            option("-b, --pgdb [database]", "the postgres database name to enable", "").
            option("-u, --pguser [user]", "the postgres user to run as", "postgres").
            option("-a, --pgpass [pass]", "the pass of the postgres user", "").
            option("-o, --pgport [port]", "port to connect to", 5432).
            parse(argv);
        this.params = app;
    }

    addCustomMetrics() {
        const self = this;
        if (self.protocol_observer) {
            /* 
               in addition to what was discovered through the node-agent query, we will
               have additional metrics provided by the protocol_observer for postgres.
               
               since the arrival of these additional metrics is based on stimulus to
               the postgres server itself, we have to fake their existence into the node agent
               by writing blank values.
            */
            var po = {};
            var types = ["Query", "Execute", "Bind"];
            var seps = ["`", "`SELECT`", "`INSERT`", "`UPDATE`", "`DELETE`"];
            var atts = ["latency", "request_bytes", "response_bytes", "response_rows"];
            for (var type in types) {
                for (var sep in seps ) {
                    for (var att in atts) {
                        if (po[types[type] + seps[sep] + atts[att]] == undefined) {
                            po[types[type] + seps[sep] + atts[att]] = {"_type": "n", "_value": null};
                        }
                    }
                }
            }

            var url = cosi.agent_url;
            if (!url.endsWith("/")) {
                url += "/";
            }
            url += "write/postgres_protocol_observer";
            console.log("Posting to: " + url);

            var client = require('request');
            client.post(url, {"json": po}, function(error, response, body) {
                if (error || response.statusCode != 200) {
                    console.log(error);
                }
            });
        }
    }

    _configPostgres(stdout) {
        const self = this;
        /* if we have gotten here, nad-enable.sh has flipped on the postgres plugin and tested it to work.. it has passed us the output of nad-enable.sh which should contain the data_dir */
        console.log("postgres/nad-enable.sh successful");       

        const nadPluginOutput = JSON.parse(stdout);
        
        console.log("NAD portion of plugin complete.  Re-registering this host");
        this.once("register.done", () => {
            const files = fs.readdirSync(self.regDir);

            /* algorithm here is to substring search for the nadPluginOutput.data_dir in 
               each registered graph's datapoints's metric_names.  If we find a substring 
               match then that is our filesystem graph choice.

               If we don't get a match, slice off the last folder and redo search until 
               we find some reasonable matching filesystem graph
               */
            var dataDir = nadPluginOutput.data_dir;
            var fsGraphId;
            while (dataDir.length) {

                for (let i = 0; i < files.length; i++) {
                    const file = files[i];
                    if (file.match(/^registration-graph-([^.]+)+\.json?$/)) {
                        try {
                            const configFile = path.resolve(this.regDir, file);
                            const graph = require(configFile);
                            for (let j = 0; j < graph.datapoints.length; j++) {
                                if (graph.datapoints[j].metric_name != null && graph.datapoints[j].metric_name.indexOf(dataDir) > -1) {
                                    fsGraphId = graph._cid.replace("/graph/","");
                                }
                            }
                        }
                        catch (err) {
                            this.emit("error", err);
                        }
                    }
                }
                dataDir = dataDir.slice(0, dataDir.lastIndexOf("/"));
            }
            self.emit("dashboard.create", fsGraphId);
        });

        this.once("dashboard.create", (fsGraphId) => {
            self.once("dashboard.done", () => {
                self.emit("plugin.done");
            });
            self.configDashboard("postgres", self.params.quiet, [self.params.pgdb], fsGraphId);
        });

        if (nadPluginOutput.enabled) {    
            this.protocol_observer = nadPluginOutput.protocol_observer;
            this.reregisterHost();        
        }
    }

    enable() {
        const self = this;

        /* stdout will contain the path to the data storage for the database */
        this.once("postgres.nad.enabled", (stdout) => {
            self.emit("config.postgres", stdout);
        });

        const stdout = execSync('psql -V');
        if (!stdout.indexOf("PostgreSQL") == -1) {
            self.emit("error", "Cannot find 'psql' in your path, postgres nad plugin will not work");
            return;
        }        

        /* write a pg-conf.sh file for the nad plugin to operate..
           this belongs in /opt/circonus/etc/ */
        const pg_conf_file = "/opt/circonus/etc/pg-conf.sh";
        const pg_po_conf_file = "/opt/circonus/etc/pg-po-conf.sh";
        const contents = `#!/bin/bash
        
PGUSER=${self.params.pguser}
PGDATABASE=${self.params.pgdb}        
        `;

        fs.writeFileSync(
            pg_conf_file,
            contents,
            { encoding: "utf8", mode: 0o644, flag: "w" }
        );        

        const po_contents = `#!/bin/bash
        
NADURL="${self.agentURL}"
        `;

        fs.writeFileSync(
            pg_po_conf_file,
            po_contents,
            { encoding: "utf8", mode: 0o644, flag: "w" }
        );        

        const script = path.resolve(path.join(__dirname, "nad-enable.sh"));
        
        self._execShell(script, "postgres.nad.enabled");        
    }

    disable() {
        this.disablePlugin("postgres", "postgres", "pg_");
    }
}

module.exports = Postgres;


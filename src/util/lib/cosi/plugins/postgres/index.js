"use strict";

/* eslint-env node, es6 */
/* eslint-disable no-magic-numbers, global-require, camelcase */

const fs = require("fs");
const path = require("path");
const child = require("child_process");

/* just using this to parse argv */
// const app = require("commander");
const chalk = require("chalk");
const client = require("request");

const cosi = require(path.resolve(path.join(__dirname, "..", "..", "..", "cosi")));
const Plugin = require(path.resolve(cosi.lib_dir, "plugins"));
// const Check = require(path.resolve(cosi.lib_dir, "check"));
// const Graph = require(path.resolve(cosi.lib_dir, "graph"));
// const Dashboard = require(path.resolve(cosi.lib_dir, "dashboard"));

class Postgres extends Plugin {

    constructor(params) {
        super(params.quiet);
        this.name = "postgres";
        this.on("config.postgres", this._configPostgres);
        this.params = params;
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
            const po = {};
            const types = [ "Query", "Execute", "Bind" ];
            const seps = [ "`", "`SELECT`", "`INSERT`", "`UPDATE`", "`DELETE`" ];
            const atts = [ "latency", "request_bytes", "response_bytes", "response_rows" ];

            // for (const type of types) {
            for (let i = 0; i < types.length; i++) {
                const type = types[i];

                // for (const sep of seps ) {
                for (let j = 0; j < seps.length; j++) {
                    const sep = seps[j];

                    // for (const att of atts) {
                    for (let k = 0; k < atts.length; k++) {
                        const att = atts[k];
                        const key = type + sep + att;

                        if (!{}.hasOwnProperty.call(po, key)) {
                            po[key] = { "_type": "n", "_value": null };
                        }
                    }
                }
            }

            let url = cosi.agent_url;

            if (!url.endsWith("/")) {
                url += "/";
            }
            url += "write/postgres_protocol_observer";
            console.log(`Posting to: ${url}`);

            client.post(url, { "json": po }, (error, response, body) => {
                if (error || response.statusCode !== 200) {
                    console.error(chalk.red("ERROR"), error, body);
                }
            });
        }
    }

    _configPostgres(stdout) {
        const self = this;

        /*
        if we have gotten here, nad-enable.sh has flipped on the postgres plugin and
        tested it to work.. it has passed us the output of nad-enable.sh which should
        contain the data_dir
        */
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
            let dataDir = nadPluginOutput.data_dir;
            let fsGraphId = null;

            while (dataDir.length) {
                // for (const file of files) {
                for (let i = 0; i < files.length; i++) {
                    const file = files[i];

                    if (file.match(/^registration-graph-([^.]+)+\.json?$/)) {
                        try {
                            const configFile = path.resolve(this.regDir, file);
                            const graph = require(configFile);

                            for (let j = 0; j < graph.datapoints.length; j++) {
                                if (graph.datapoints[j].metric_name !== null && graph.datapoints[j].metric_name.indexOf(dataDir) > -1) {
                                    fsGraphId = graph._cid.replace("/graph/", "");
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
            self.configDashboard("postgres", self.params.quiet, [ self.params.pgdb ], fsGraphId);
        });

        if (nadPluginOutput.enabled) {
            this.protocol_observer = nadPluginOutput.protocol_observer;
            this.reregisterHost();
        }
    }

    enable() {
        try {
            const psql_test_stdout = child.execSync("psql -V");

            if (!psql_test_stdout || psql_test_stdout.indexOf("PostgreSQL") === -1) {
                this.emit("error", "Cannot find 'psql' in PATH, postgres plugin will not work");
                return;
            }
        }
        catch (err) {
            this.emit("error", err);
            return;
        }

        /* write a pg-conf.sh file for the nad plugin to operate..
           this belongs in /opt/circonus/etc/ */
        const pg_conf_file = "/opt/circonus/etc/pg-conf.sh";
        let contents = [];

        if (this.params.pguser !== "") {
            contents.push(`export PGUSER=${this.params.pguser}`);
        }
        if (this.params.pgdb !== "") {
            contents.push(`export PGDATABASE=${this.params.pgdb}`);
        }
        if (this.params.pgport !== "") {
            contents.push(`export PGPORT=${this.params.pgport}`);
        }
        if (this.params.pgpass !== "") {
            contents.push(`export PGPASSWORD=${this.params.pgpass}`);
        }

        fs.writeFileSync(
            pg_conf_file,
            contents.join("\n"),
            { encoding: "utf8", mode: 0o644, flag: "w" }
        );

        // protocol observer config file
        const pg_po_conf_file = "/opt/circonus/etc/pg-po-conf.sh";

        contents = [];
        if (this.agentURL !== "") {
            contents.push(`NADURL="${this.agentURL}"`);
        }

        fs.writeFileSync(
            pg_po_conf_file,
            contents.join("\n"),
            { encoding: "utf8", mode: 0o644, flag: "w" }
        );

        const self = this;
        const script = path.resolve(path.join(__dirname, "nad-enable.sh"));

        /* stdout will contain the path to the data storage for the database */
        this.once("postgres.nad.enabled", (stdout) => {
            self.emit("config.postgres", stdout);
        });

        this._execShell(script, "postgres.nad.enabled");
    }

    disable() {
        this.disablePlugin("postgres", "postgres", "pg_");
    }
}

module.exports = Postgres;

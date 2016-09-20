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


class Cassandra extends Plugin {

    constructor(quiet, argv) {
        super(quiet);
        this.name = "cassandra";
        this.on("config.cassandra", this._configCassandra);
        app.
            version(cosi.app_version).
            option("-e, --enable", "enable the cassandra plugin").
            option("-d, --disable", "disable the cassandra plugin").
            parse(argv);
        this.params = app;
    }

    addCustomMetrics() {
        const self = this;
        if (self.protocol_observer) {
            /* 
               in addition to what was discovered through the node-agent query, we will
               have additional metrics provided by the protocol_observer for cassandra.
               
               since the arrival of these additional metrics is based on stimulus to
               the cassandra server itself, we have to fake their existence into the node agent
               by writing blank values.
            */
            var po = {};
            var types = ["Query", "Execute", "Prepare"];
            var seps = ["`"];
            var atts = ["latency", "request_bytes", "response_bytes"];
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
            url += "write/cassandra_protocol_observer";
            console.log("Posting to: " + url);

            var client = require('request');
            client.post(url, {"json": po}, function(error, response, body) {
                if (error || response.statusCode != 200) {
                    console.log(error);
                }
            });
        }
    }

    _configCassandra(stdout) {
        const self = this;
        /* if we have gotten here, nad-enable.sh has flipped on the postgres plugin and tested it to work.. it has passed us the output of nad-enable.sh which should contain the data_dir */
        console.log("cassandra/nad-enable.sh successful");       

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
            self.configDashboard("cassandra", self.params.quiet, ["cassandra"], fsGraphId);
        });

        if (nadPluginOutput.enabled) {    
            this.protocol_observer = nadPluginOutput.protocol_observer;
            this.reregisterHost();        
        }
    }

    enable() {
        const self = this;

        /* stdout will contain the path to the data storage for the database */
        this.once("cassandra.nad.enabled", (stdout) => {
            self.emit("config.cassandra", stdout);
        });

        const stdout = execSync('nodetool version');
        if (!stdout.indexOf("ReleaseVersion") == -1) {
            self.emit("error", "Cannot find 'nodetool' in your path, cassandra nad plugin will not work");
            return;
        }        

        const cass_po_conf_file = "/opt/circonus/etc/cass-po-conf.sh";
        const po_contents = `#!/bin/bash
        
NADURL="${self.agentURL}"
        `;

        fs.writeFileSync(
            cass_po_conf_file,
            po_contents,
            { encoding: "utf8", mode: 0o644, flag: "w" }
        );        

        const script = path.resolve(path.join(__dirname, "nad-enable.sh"));
        
        self._execShell(script, "cassandra.nad.enabled");        
    }

    disable() {
        this.disablePlugin("cassandra", "cassandra", "cassandra_");
    }
}

module.exports = Postgres;


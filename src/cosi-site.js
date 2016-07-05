/*
 * Copyright 2015 Circonus, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License. You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.
 */

/*eslint-env node, es6 */

"use strict";

// core modules
const path = require("path");

// local modules
const restify = require("restify");

// application modules
const settings = require(path.normalize(path.join(__dirname, "lib", "settings")));
const validate = require(path.resolve(path.join(__dirname, "lib", "validators")));
const handler = require(path.resolve(path.join(__dirname, "lib", "handlers")));
const log = require(path.resolve(path.join(__dirname, "lib", "logger")));

const serverOptions = {
    name: settings.app_name,
    log
};

if (settings.ssl_cert_file !== null && settings.ssl_key_file !== null) {
    // add any valid options from nodejs https module's createServer call
    serverOptions.httpsServerOptions = {
        cert: settings.ssl_cert_file,
        key: settings.ssl_key_file
    };
}

const server = restify.createServer(serverOptions);

server.use(restify.queryParser());
server.use(restify.bodyParser());
server.use(restify.gzipResponse());
server.use(restify.requestLogger());
server.use(restify.throttle({
    burst: 100,
    rate: 50,
    ip: true,
    overrides: {
        "127.0.0.1": {
            rate: 0,        // unlimited
            burst: 0
        }
    }
}));


//
// log each request coming in (for metrics)
//
server.on("after", restify.auditLogger({ log }));

server.on("uncaughtException", (req, res, route, err) => {
    log.fatal(`uncaughtException ${route} ${req.params} ${err.stack}`);
    process.exit(1); //eslint-disable-line no-process-exit, no-magic-numbers
});


//
// return json listing distribution variants supported
//
server.get("/", handler.root);

//
// generic robot response, disallow everything...
//
server.get("/robots.txt", handler.robots);

//
// get the package to use for a specific distribution
//
// required parameters: type, dist, vers, arch
// optional parameters: redirect (will redirect to the package URL. don't care
//                      about the value, just the presence of parameter.)
//
server.get(
    { path: /^\/package\/?$/, version: "1.0.0" },
    validate.requiredParameters,
    handler.agentPackage
);


//
// return template list
//
// required parameters: type, dist, vers, arch
//
server.get(
    { path: /^\/templates\/?$/, version: "1.0.0" },
    validate.requiredParameters,
    handler.templateList
);

//
// return specific template
//
// required parameters: type, dist, vers, arch, template type, template id
//
server.get(
    { path: "/template/:t_cat/:t_name", version: "1.0.0" },
    validate.requiredParameters,
    validate.templateId,
    handler.configTemplate
);

//
// return default broker (for nad check) based on mode (pull|push|reverse)
// these are all converging to be the same 'type' of check (json:nad) but,
// will leave separate settings for each to allow local customization by
// agent type.
//
server.get(
    { path: /^\/broker\/?$/, version: "1.0.0" },
    validate.agentMode,
    handler.defaultBroker
);

//
// return default brokers for check types
//
server.get(
    { path: /^\/brokers\/?$/, version: "1.0.0" },
    handler.defaultBrokers
);

//
// handle /install or /install/
//
// return the cosi-install script, designed to be used via:
//      \curl https://cosi.circonus.com/install | bash -s
//
server.get(/^\/install\/?$/, restify.serveStatic({
    directory: "./content/files",
    file: "cosi-install.sh",
    maxAge: 0
}));

//
// handle /install/conf or /install/conf/
// handle /install/config or /install/config/
//
// return the cosi-install skeleton config, designed to be used via:
//      \curl https://cosi.circonus.com/install/config > /etc/defaults/cosi-install
//
server.get(/^\/install\/conf(?:ig)?\/?$/, restify.serveStatic({
    directory: "./content/files",
    file: "cosi-install.conf",
    maxAge: 0
}));


if (settings.installer_rpm_file !== null) {
    //
    // handle /install/rpm
    //
    // optional, will 404 if no rpm file is provided (or it's not accessible)
    //
    // return the cosi rpm to install cosi-install.sh script, designed to be used via:
    //      rpm -ivh "https://onestep.circonus.com/install/rpm"
    //      /opt/circonus/cosi/bin/cosi-install.sh --key ... --app ... ...
    //
    server.get(/^\/install\/rpm?$/, restify.serveStatic({
        directory: "./content/files",
        file: settings.installer_rpm_file,
        maxAge: 0
    }));
}


//
// handle /utils or /utils/
//
// return the cosi-utils (containing cosi-register script and nadpush script)
// designed to be used by cosi-install script once the omnibus agent package
// has beein installed. leverage the installed (omnibus/embedded) node and
// to perform the default tasks using the Circonus API:
//
//      create check with default metrics enabled
//      create default graphs
//      create worksheet containing default graphs
//
server.get(/^\/utils\/?$/, restify.serveStatic({
    directory: "./content/files",
    file: "cosi-util.tar.gz",
    maxAge: 0
}));


//
// handle /statsd or /statsd/
//
// return the cosi-statsd (containing circonus backend)
//
server.get(/^\/statsd\/?$/, restify.serveStatic({
    directory: "./content/files",
    file: "cosi-statsd.tar.gz",
    maxAge: 0
}));


//
// fire in the hole!
//
server.listen(settings.port, settings.listen, () => {
    log.info({ addr: server.address() }, "listening");
    if (settings.user !== null && process.seteuid) {
        log.info(`Changing "effective user" to "${settings.user}".`);
        try {
            process.seteuid(settings.user);
        }
        catch (err) {
            throw err;
        }
    }
});

// END

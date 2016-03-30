#!/usr/bin/env node

/* eslint-disable no-magic-numbers, no-warning-comments */

"use strict";

const fs = require("fs");
const http = require("http");
const https = require("https");
const path = require("path");
const url = require("url");

const config = {
    package_url: "http://updates.circonus.net/node-agent/packages/",
    package_idx_args: "C=M;O=D;F=0",
    package_list_file: path.resolve(__dirname, "../etc/circonus-packages.json")
};

console.log("Using configuration:", config);

let client = http;
let package_url = config.package_url;

if (config.package_idx_args && config.package_idx_args.length > 0) {
    if (package_url.substr(-1) !== "/") {
        package_url += "/";
    }
    package_url += `${config.package_idx_args.substr(0, 1) === "?" ? "" : "?"}${config.package_idx_args}`;
}

const pkg_url = url.parse(package_url);

if (pkg_url.protocol === "https:") {
    client = https;
}

console.log(`Retrieving package list from '${pkg_url.href}'`);

client.get(pkg_url, (res) => {
    let data = "";

    res.on("data", (chunk) => { data += chunk; });
    res.on("end", () => {

        if (res.statusCode !== 200) {
            throw new Error(res.statusMessage);
        }

        console.log("Parsing...");

        const lines = data.split("\n");
        const package_list = {};
        const package_idx = {};

        lines.forEach((line) => {
            if (line.substr(0, 4) === "<li>") {
                const matches = line.match(/href="([^"]+)"/);

                if (matches) {
                    const package_id = matches[1].substr(matches[1].indexOf("."));

                    if (!package_idx.hasOwnProperty(package_id)) {
                        const package_parts = matches[1].split(".");
                        const package_ext = package_parts.pop();

                        package_idx[package_id] = matches[1];

                        let os_dist = null;
                        let os_vers = null;
                        let os_arch = null;

                        switch (package_ext) {
                            case "deb": {
                                /* package parts e.g.
                                [ 'nad-omnibus-20150422T174727Z-1', 'ubuntu', '14', '04_i386', 'deb' ]
                                */
                                if (package_parts[1] !== "ubuntu") {
                                    throw new Error(`Unknown 'deb' distribution ${matches[1]}`);
                                }

                                // could do ["Debian", "Ubuntu"] but right now there is only specific support for Ubuntu
                                // TODO test omnibus deb on Debian
                                os_dist = "Ubuntu";

                                const sub_parts = package_parts[3].split("_");

                                if (package_parts[2] === "10") {
                                    // ubuntu 10.04 is EOL
                                    break;
                                }

                                os_vers = `${package_parts[2]}.${sub_parts[0]}`;
                                os_arch = sub_parts[1];
                                if (os_arch === "amd64") {
                                    // builder produces amd64 but arch detection in cosi-install script reports x86_64 (uname -p)
                                    os_arch = "x86_64";
                                }
                                break;
                            }
                            case "rpm": {
                                /* package parts e.g.
                                [ 'nad-omnibus-20150422T174727Z-1', 'el7', 'x86_64', 'rpm' ]
                                */
                                if (package_parts[1].substr(0, 2) !== "el") {
                                    throw new Error(`Unknown 'rpm' distribution ${matches[1]}`);
                                }

                                // could do ["RedHat", "CentOS", "Fedora"] but right now there is only specific support for CentOS
                                // TODO test rpm on RHEL and Fedora so those distros can be aliased
                                os_dist = "CentOS";
                                os_vers = package_parts[1].substr(2, 1);
                                os_arch = package_parts[2];
                                break;
                            }
                            default: {
                                throw new Error(`Unknown package extention ${matches[1]}`);
                            }
                        }

                        if (os_dist !== null && os_vers !== null && os_arch !== null) {
                            if (!package_list.hasOwnProperty(os_dist)) {
                                package_list[os_dist] = {};
                            }
                            if (!package_list[os_dist].hasOwnProperty(os_vers)) {
                                package_list[os_dist][os_vers] = [];
                            }
                            package_list[os_dist][os_vers].push({ "arch": os_arch, "package_file": matches[1] });
                        }
                    }
                }
            }
        });

        // add distro aliases:

        // RHEL based
        // package_list.RedHat = package_list.CentOS;
        // package_list.Fedora = package_list.CentOS;

        // Debian based
        // package_list.Debian = package_list.Ubuntu;

        fs.writeFile(config.package_list_file, JSON.stringify(package_list, null, 4), (err) => {
            if (err) {
                throw err;
            }
            console.log(`Package list saved to ${config.package_list_file}.\nTo use, restart cosi-site service.`);
        });

    });
}).on("error", (e) => {
    console.log(`Request error '${e.message}'`);
});

// END

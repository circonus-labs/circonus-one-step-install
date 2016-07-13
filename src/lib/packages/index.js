/*eslint-env node, es6 */
/*eslint-disable global-require, no-process-exit, no-magic-numbers, guard-for-in */

"use strict";

// load core modules
const path = require("path");

// load app modules
const settings = require(path.normalize(path.join(__dirname, "..", "settings")));
const log = require(path.normalize(path.join(__dirname, "..", "logger")));

let instance = null;

class Packages {

    constructor() {
        if (instance !== null) {
            return instance;
        }

        instance = this; //eslint-disable-line consistent-this

        this.load_time = new Date();
        this.packageFiles = [];
        this.packages = new Map();
        this.packages.set("supported", new Map());
        this.defaultPackageUrl = settings.package_url;

        this.loadFile(settings.package_list_file);

        return instance;
    }

    loadFile(file) {
        let packageList = {};

        log.info(`Loading package list from '${file}'.`);

        try {
            packageList = require(file);
        }
        catch (err) {
            let msg = null;

            if (err.code === "MODULE_NOT_FOUND") {
                msg = `Package list '${file}' not found.`;
            }
            else if (err instanceof SyntaxError) {
                msg = `Syntax error in package list '${file}'`;
            }
            else {
                msg = `Unknown error loading package list '${file}'`;
            }

            log.fatal(msg, { err });
            process.exit(1);
        }

        this.packageFiles.push(file);

        for (const dist in packageList) {
            for (const vers in packageList[dist]) {
                for (const pkg of packageList[dist][vers]) {
                    const arch = pkg.arch;
                    const pkgInfo = pkg.package_info;
                    const pkgKey = this._key(dist, vers, arch);

                    if (!this.packages.has(dist)) {
                        this.packages.set(dist, new Map());
                    }
                    if (!this.packages.get(dist).has(vers)) {
                        this.packages.get(dist).set(vers, new Map());
                    }
                    if (!this.packages.get(dist).get(vers).has(arch)) {
                        this.packages.get(dist).get(vers).set(arch, pkgInfo);
                    }

                    log.info(`Adding package ${pkgKey} ${pkgInfo}`);
                    this.packages.get("supported").set(pkgKey, pkgInfo);
                }
            }
        }
    }

    supportedList() {
        return Array.from(this.packages.get("supported").keys());
    }

    isSupported(dist, vers, arch) {
        return typeof this.getPackage(dist, vers, arch) !== "undefined";
    }

    getPackage(dist, vers, arch) {
        const pkgInfo = this.packages.get("supported").get(this._key(dist, vers, arch));

        if (typeof pkgInfo === "undefined") {
            return pkgInfo;
        }

        let pkgDef = null;

        if (dist.match(/^OmniOS$/i)) {
            pkgDef = `${pkgInfo.publisher_url}%%${pkgInfo.publisher_name}%%${pkgInfo.package_name}`;
        }
        else {
            const pkgUrl = pkgInfo.package_url === null ? this.defaultPackageUrl : pkgInfo.package_url;
            const pkgFile = pkgInfo.package_file;

            if (pkgFile !== null) {
                pkgDef = `${pkgUrl}%%${pkgFile}`;
            }
        }

        return pkgDef;
    }

    haveDistro(dist) {
        return this.packages.has(dist);
    }

    haveVersion(dist, vers) {
        const checkVersion = this._fixVersion(dist, vers);

        if (!this.haveDistro(dist)) {
            return false;
        }

        return this.packages.get(dist).has(checkVersion);
    }

    haveArchitecture(dist, vers, arch) {
        const checkVersion = this._fixVersion(dist, vers);

        if (!this.haveDistro(dist)) {
            return false;
        }

        if (!this.haveVersion(dist, vers)) {
            return false;
        }

        return this.packages.get(dist).get(checkVersion).has(arch);
    }

    getError(dist, vers, arch) {
        const checkVersion = this._fixVersion(dist, vers);
        const err = new Error();

        err.code = "NOT_FOUND";

        if (!this.packages.has(dist)) {

            err.message = `OS Distribution ${dist} not supported`;
            return err;

        }
        else if (!this.packages.get(dist).has(checkVersion)) {

            err.message = `Version ${vers} of ${dist} not supported`;
            return err;

        }
        else if (!this.packages.get(dist).get(checkVersion).has(arch)) {

            err.message = `${arch} of ${dist} v${vers} not supported`;
            return err;

        }

        return null;
    }

    _fixVersion(dist, vers) {
        if (dist && dist.match(/^(CentOS|Fedora|RedHat|Oracle)$/)) {
            return vers.substr(0, 1);
        }
        return vers;
    }

    _key(dist, vers, arch) {
        const checkVersion = this._fixVersion(dist, vers);

        return `${dist} ${checkVersion} ${arch}`;
    }

}

module.exports = new Packages();

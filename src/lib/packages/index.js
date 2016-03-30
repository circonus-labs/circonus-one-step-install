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

        this.loadFile(settings.package_list_file);

        return instance;
    }

    loadFile(file) {
        let packageList = {};

        log.info(`Loading package list from '${file}'.`);

        try {
            packageList = require(file);
        } catch (err) {
            let msg = null;

            if (err.code === "MODULE_NOT_FOUND") {
                msg = `Package list '${file}' not found.`;
            } else if (err instanceof SyntaxError) {
                msg = `Syntax error in package list '${file}'`;
            } else {
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
                    const pkgFile = pkg.package_file;
                    const pkgKey = this._key(dist, vers, arch);

                    if (!this.packages.has(dist)) {
                        this.packages.set(dist, new Map());
                    }
                    if (!this.packages.get(dist).has(vers)) {
                        this.packages.get(dist).set(vers, new Map());
                    }
                    if (!this.packages.get(dist).get(vers).has(arch)) {
                        this.packages.get(dist).get(vers).set(arch, pkgFile);
                    }

                    log.info(`Adding package ${pkgKey} ${pkgFile}`);
                    this.packages.get("supported").set(pkgKey, pkgFile);
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
        return this.packages.get("supported").get(this._key(dist, vers, arch));
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

        } else if (!this.packages.get(dist).has(checkVersion)) {

            err.message = `Version ${vers} of ${dist} not supported`;
            return err;

        } else if (!this.packages.get(dist).get(checkVersion).has(arch)) {

            err.message = `${arch} of ${dist} v${vers} not supported`;
            return err;

        }

        return null;
    }

    _fixVersion(dist, vers) {
        if (dist && dist.match(/^(CentOS|Fedora|RedHat)$/)) {
            return vers.substr(0, 1);
        }
        return vers;
    }

    _key(dist, vers, arch) {
        const checkVersion = this._fixVersion(dist, vers);

        return `${dist} ${checkVersion} ${arch}`;
    }

///// old code

    // check(dist, vers, arch) {
    //     const chk_dist = dist || "unsup";
    //     let chk_vers = vers || "unsup";
    //     const chk_arch = arch || "unsup";
    //     const result = {
    //         errors: [],
    //         packageFile: null,
    //         defaultCfg: null,
    //         isSupported: false
    //     };
    //
    //     if (chk_dist.match(/^(CentOS|Fedora|RedHat)$/)) {
    //         chk_vers = chk_vers.substr(0, 1); // eslint-disable-line no-magic-numbers
    //     }
    //
    //     if (this.distros.hasOwnProperty(chk_dist)) {
    //         if (this.distros[chk_dist].hasOwnProperty(chk_vers)) {
    //             if (this.distros[chk_dist][chk_vers].hasOwnProperty(chk_arch)) {
    //                 result.isSupported = true;
    //                 result.packageFile = this.distros[chk_dist][chk_vers][chk_arch].packageFile;
    //                 result.defaultCfg = this.distros[chk_dist][chk_vers][chk_arch].defaultCfg;
    //             } else {
    //                 result.errors.push(`Architecture ${arch} not supported.`);
    //             }
    //         } else {
    //             result.errors.push(`Version ${vers} not supported.`);
    //         }
    //     } else {
    //         result.errors.push(`Distribution ${dist} not supported.`);
    //     }
    //
    //     return result;
    // }
    //
    // _loadPackageList() {
    //     let packages = {};
    //
    //     log.info(`Loading package list from '${this.package_file}'.`);
    //
    //     try {
    //         packages = require(this.package_file); // eslint-disable-line global-require
    //     } catch (err) {
    //         let msg = `Unknown error loading package list '${this.package_file}'`;
    //
    //         if (err.code === "MODULE_NOT_FOUND") {
    //             msg = `Package list '${this.package_file}' not found.`;
    //         } else if (err instanceof SyntaxError) {
    //             msg = `Syntax error in package list '${this.package_file}'`;
    //         }
    //         log.fatal(msg, { err });
    //         process.exit(1); // eslint-disable-line no-process-exit, no-magic-numbers
    //     }
    //
    //     for (const dist in packages) {
    //         if (packages.hasOwnProperty(dist)) {
    //             for (const vers in packages[dist]) {
    //                 if (packages[dist].hasOwnProperty(vers)) {
    //                     for (let i = 0; i < packages[dist][vers].length; i++) {
    //                         const arch = packages[dist][vers][i].arch;
    //                         const packageFile = packages[dist][vers][i].package_file;
    //                         const defaultCfg = this._loadDefaultConfig(dist, vers, arch);
    //
    //                         if (defaultCfg !== null) {
    //                             /*
    //                               **MUST** have both in order to update distros and supported:
    //                                 1 a presence in the packages.json (iow, a package)
    //                                 2 a default config (config_dir/dist/vers/arch/config.json)
    //                             */
    //                             if (!this.distros.hasOwnProperty(dist)) {
    //                                 this.distros[dist] = {};
    //                             }
    //
    //                             if (!this.distros[dist].hasOwnProperty(vers)) {
    //                                 this.distros[dist][vers] = {};
    //                             }
    //
    //                             this.distros[dist][vers][arch] = { packageFile, defaultCfg };
    //                             this.supported.push(`${dist} ${vers} ${arch}`);
    //                         }
    //                     }
    //                 }
    //             }
    //         }
    //     }
    // }
    //
    // _loadDefaultConfig(dist, vers, arch) {
    //     const dist_sig = `${dist} v${vers} ${arch}`;
    //     const cfgFileName = "config.json";
    //     const defaultConfigFileList = [
    //         path.resolve(path.join(this.config_dir, dist, vers, arch, cfgFileName)),
    //         path.resolve(path.join(this.config_dir, dist, vers, cfgFileName)),
    //         path.resolve(path.join(this.config_dir, dist, cfgFileName))
    //     ];
    //
    //     let defaultConfig = null;
    //
    //     for (let i = 0; i < defaultConfigFileList.length; i++) {
    //         log.info(defaultConfigFileList[i]);
    //         try {
    //             defaultConfig = require(defaultConfigFileList[i]); // eslint-disable-line global-require
    //             log.info(`${dist_sig} - LOADED - ${defaultConfigFileList[i]}`);
    //             break;
    //         } catch (err) {
    //             if (err.code === "MODULE_NOT_FOUND") {
    //                 log.warn(`${dist_sig} - NOT FOUND - ${defaultConfigFileList[i]}`);
    //             } else if (err instanceof SyntaxError) {
    //                 log.fatal(`${dist_sig} - ERROR - Syntax error in '${defaultConfigFileList[i]}'`, { err });
    //                 process.exit(1); //eslint-disable-line no-process-exit, no-magic-numbers
    //             }
    //         }
    //     }
    //
    //     if (defaultConfig === null) {
    //         /*
    //         log it, there is a valid use-case (e.g. using the public package
    //         url but, limiting distros to a subset which is locally supported/acceptable).
    //         so, let the "valid" dist/vers/arch be removed from the package list.
    //         */
    //         log.warn(`${dist_sig} - SKIPPING - No default config file found, removing from package list.`);
    //     }
    //     return defaultConfig;
    // }
}

module.exports = new Packages();

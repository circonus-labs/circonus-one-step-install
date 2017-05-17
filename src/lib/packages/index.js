'use strict';

// load core modules
const path = require('path');

/* eslint max-depth: ["error", 6]*/

// load app modules
const settings = require(path.normalize(path.join(__dirname, '..', 'settings')));
const log = require(path.normalize(path.join(__dirname, '..', 'logger')));

let instance = null;

class Packages {

    /**
     * initialize packages class
     */
    constructor() {
        if (instance !== null) {
            return instance;
        }

        instance = this; // eslint-disable-line consistent-this

        this.load_time = new Date();
        this.packageFiles = [];
        this.packages = new Map();
        this.packages.set('supported', new Map());
        this.defaultPackageUrl = settings.package_url;

        this.loadFile(settings.package_list_file);

        return instance;
    }

    /**
     * load package definition file
     * @arg {String} file name to load
     * @returns {Object} loaded file
     */
    loadFile(file) {
        let packageList = {};

        log.info(`Loading package list from '${file}'.`);

        try {
            packageList = require(file); // eslint-disable-line global-require
        } catch (err) {
            let msg = null;

            if (err.code === 'MODULE_NOT_FOUND') {
                msg = `Package list '${file}' not found.`;
            } else if (err instanceof SyntaxError) {
                msg = `Syntax error in package list '${file}'`;
            } else {
                msg = `Unknown error loading package list '${file}'`;
            }

            log.fatal(msg, { err });
            process.exit(1); // eslint-disable-line no-process-exit
        }

        this.packageFiles.push(file);

        for (const dist in packageList) {
            if ({}.hasOwnProperty.call(packageList, dist)) {
                for (const vers in packageList[dist]) {
                    if ({}.hasOwnProperty.call(packageList[dist], vers)) {
                        for (const pkg of packageList[dist][vers]) {
                            if ({}.hasOwnProperty.call(packageList[dist][vers], pkg)) {
                                const arch = pkg.arch;
                                const pkgInfo = pkg.package_info;
                                const pkgKey = this._key(dist, vers, arch);

                                if (!this.packages.has(dist)) {
                                    this.packages.set(dist, new Map());
                                }
                                if (!this.packages.
                                    get(dist).
                                    has(vers)) {
                                    this.packages.
                                        get(dist).
                                        set(vers, new Map());
                                }
                                if (!this.packages.
                                    get(dist).
                                    get(vers).
                                    has(arch)) {
                                    this.packages.
                                        get(dist).
                                        get(vers).
                                        set(arch, pkgInfo);
                                }

                                log.info(`Adding package ${pkgKey} ${pkgInfo}`);
                                this.packages.
                                    get('supported').
                                    set(pkgKey, pkgInfo);
                            }
                        }
                    }
                }
            }
        }
    }

    /**
     * list of supported distros
     * @returns {Array} list of keys for supported distros
     */
    supportedList() {
        return Array.from(this.packages.get('supported').keys());
    }

    /**
     * check if specific distro is supported
     * @arg {String} dist os distro
     * @arg {String} vers os distro version
     * @arg {String} arch platform architecture
     * @returns {Boolean} supported or not
     */
    isSupported(dist, vers, arch) {
        return typeof this.getPackage(dist, vers, arch) !== 'undefined';
    }

    /**
     * get package details for supported os distro
     * @arg {String} dist os distro
     * @arg {String} vers os distro version
     * @arg {String} arch platform architecture
     * @returns {String} package definition string or undefined
     */
    getPackage(dist, vers, arch) {
        const pkgInfo = this.packages.
            get('supported').
            get(this._key(dist, vers, arch));

        if (typeof pkgInfo === 'undefined') {
            return pkgInfo;
        }

        let pkgDef = null;

        if (dist.match(/^OmniOS$/i)) {
            pkgDef = `${pkgInfo.publisher_url}%%${pkgInfo.publisher_name}%%${pkgInfo.package_name}`;
        } else {
            const pkgUrl = pkgInfo.package_url === null
                ? this.defaultPackageUrl : pkgInfo.package_url;
            const pkgFile = pkgInfo.package_file;

            if (pkgFile !== null) {
                pkgDef = `${pkgUrl}%%${pkgFile}`;
            }
        }

        return pkgDef;
    }

    /**
     * is distro known
     * @arg {String} dist os distribution
     * @returns {Boolean} known or not
     */
    haveDistro(dist) {
        return this.packages.has(dist);
    }

    /**
     * is distro version known
     * @arg {String} dist os distribution
     * @arg {String} vers os distribution version
     * @returns {Boolean} known or not
     */
    haveVersion(dist, vers) {
        const checkVersion = this._fixVersion(dist, vers);

        if (!this.haveDistro(dist)) {
            return false;
        }

        return this.packages.get(dist).has(checkVersion);
    }

    /**
     * is distro version for architecture known
     * @arg {String} dist os distribution
     * @arg {String} vers os distribution version
     * @arg {String} arch platform architecture
     * @returns {Boolean} known or not
     */
    haveArchitecture(dist, vers, arch) {
        const checkVersion = this._fixVersion(dist, vers);

        if (!this.haveDistro(dist)) {
            return false;
        }

        if (!this.haveVersion(dist, vers)) {
            return false;
        }

        return this.packages.
            get(dist).
            get(checkVersion).
            has(arch);
    }

    /**
     * get a well-formed error message when distro not supported/known
     * @arg {String} dist os distribution
     * @arg {String} vers os distribution version
     * @arg {String} arch platform architecture
     * @returns {Object} error
     */
    getError(dist, vers, arch) {
        const checkVersion = this._fixVersion(dist, vers);
        const err = new Error();

        err.code = 'NOT_FOUND';

        if (!this.packages.has(dist)) {
            err.message = `OS Distribution ${dist} not supported`;

            return err;
        } else if (!this.packages.get(dist).has(checkVersion)) {
            err.message = `Version ${vers} of ${dist} not supported`;

            return err;
        } else if (!this.packages.
            get(dist).
            get(checkVersion).
            has(arch)) {
            err.message = `${arch} of ${dist} v${vers} not supported`;

            return err;
        }

        return null;
    }

    /**
     * normalize distribution version for rhel based os
     * @arg {String} dist os distribution
     * @arg {String} vers os distribution version
     * @returns {String} normalized version number
     */
    _fixVersion(dist, vers) {  // eslint-disable-line class-methods-use-this
        if (dist && dist.match(/^(CentOS|Fedora|RedHat|Oracle)$/)) {
            return vers.substr(0, 1);
        }

        return vers;
    }

    /**
     * generate distro key
     * @arg {String} dist os distribution
     * @arg {String} vers os distribution version
     * @arg {String} arch platform architecture
     * @returns {String} normalized key
     */
    _key(dist, vers, arch) {
        const checkVersion = this._fixVersion(dist, vers);

        return `${dist} ${checkVersion} ${arch}`;
    }

}

module.exports = new Packages();

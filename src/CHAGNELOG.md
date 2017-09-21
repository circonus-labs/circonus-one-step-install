### 2.4.0 2017-09-21

* fix: remove pg plugin configs on reset if postgres plugin was enabled
* upd: demo documentation
* fix: create blank `/etc/rc.conf` if it does not exist - edge usecase
* fix: abort if target cannot be derived, e.g. no hostname set - edge usecase
* fix: always add api url used by cosi to nad.conf
* add: support amzn linux 2017.03 - rhel6
* add: quick reference to system dashboard
* fix: don't enforce y-max on disk saturation graph

### 2.3.2 2017-08-24

* upd: create use dashboard regardless of graph availability
* upd: do not disable diskstats plugin when required proc files not present
* fix: do not create graphs with 0 datapoints

### 2.3.1 2017-08-24

* fix: restore --target functionality for system check

### 2.3.0 2017-08-22

* fix: work around variations in sed handling '-i'
* NAD v2.4.4
* new: os type templates
* fix: ensure /opt/circonsu/etc exists
* fix: content-length header, no keepalive, no connection cache (nadpush)
* remove obsolete statsd endpoint
* update endpoint comments
* fix: check agent mode on reset (don't uninstall reverse if nad is not reverse)

### 2.2.0 2017-08-17

* Merge PR 26 - create USE dashboard by default (with USE specific graphs)
* Update plugins to handle promises and new NAD location
* Update PostgreSQL demo example

### 2.1.0 2017-08-15

* fix api request object
* update demo for current nad
* es6/lint nadpush
* upd npm lint command in package.json
* remove obsolete files
* simplify c7 agent hook demo
* use Vagrantfile path to load configs in demo

### 2.0.1 2017-08-10

* fix template list (promises, config ref)

### 2.0.0 2017-08-10

* switch to promises
* continue nad v2 integration
* freebsd v11 support
* debian v9 support
* misc. fixes and minor updates

### 1.0.0 2017-06-05

* New NAD integration
  * add: group check (new install option `--group <name>`)
  * upd: [un]install_nadreverse
  * upd: registration (switch statsd to group, since statsd is now included in nad)
  * upd: templates (switch statsd to group, since statsd is now included in nad)
  * upd: do not delete group check with `cosi reset -a`

>  NOTE: group check is **not** deleted on `cosi reset -a`. It must be explicitly passed via `cosi reset -c group` or deleted manually in the UI. There is no way for a given system to determine if *other* systems are still depending on the group check.

### 0.12.4 2017-03-27

* fix: `transform*` ruleset attributes no longer supported/required.

### 0.12.3 2017-03-23

* add: save default nad config when setting up reverse
* add: stop nad and re-install default nad config when `--configs` used with `cosi reset`
* upd: remove statsd

### 0.12.2 2017-03-18

* fix: API no longer requires account_id field for dashboard widgets. (cassandra)

### 0.12.1 2017-03-17

* fix: API no longer requires account_id field for dashboard widgets. (postgres)
* fix: API async_metrics field for checks is string, 'true'.

### 0.12.0 2017-02-28

* add: `--broker-type` option (any|enterprise) default `any`.
      * `any` try enterprise brokers, if none available, try public brokers. if no brokers available fail.
      * `enterprise` will *only* use enterprise brokers and fail if there are no enterprise brokers or none can be used.
* upd: revert default broker selection behavior to enterprise, then public if no enterprise brokers can be used.

### 0.11.0 2017-02-22

* add: debian 7.11 (wheezy) and 8.6 (jessie)
* add: cassandra

### 0.10.2 2016-10-27

* add: forecast widget support for dashboards
* fix: workarounds for obtaining db data directory
* fix: premature end fired on api requests resulting in no/partial response body
* add: retry api requests on rate limit result code (429)
* fix: short circuit finalize if agent mode is pull

### 0.10.1 2016-10-24

* update: derive plugin directory based on location of script for postgresql plugin scripts

### 0.10.0 2016-10-19

* fix: postgres plugin adjustments
* add: force option for postgres plugin
* add: better error checking for postgres plugin enable
* add: psql\_cmd support for postgres plugin
* new: force node 4 or 6

### 0.9.0 2016-09-28

* new: plugin scaffolding
* new: plugin postgresql

### 0.8.3 2016-09-16

* new: RedHat 6 x86_64 support (tested w/RHEL 6.5.0.1 Santiago)

### 0.8.1 2016-07-13

* new: Oracle Linux v7.2 x86_64 support

### 0.8.0 2016-07-06

* new: enable circonus-statsd to provide a statsd endpoint (cosi-install --statsd) will default to ON going forward
* new: cosi-install --statsdport option
* new: cosi defaults NAD installs to reverse mode
* new: --revonly (ensure target is non-resolvable to broker) for reverse only connections
* change: pass-through custom api settings in nad reverse config (api host/port/protocol/path)
* change: refactor broker selection logic
* fix: typo in template fetch for registration setup (errors not error)
* new: add current nad package info to install log
* change: provisioning for site. use npm ansible module, back to using nodejs pkg.


### 0.7.3 2016-06-23

* new: Amazon Linux v2016.03 x86\_64 (RHEL6) support (alpha-trial)

### 0.7.2 2016-06-16

* change: protect cosi-site process on template syntax errors
* change: clarify error message for 'cosi template fetch' when template id not found
* fix: better detection of state when nad already installed for cosi-install
* new: add --configs option to cosi reset to remove configs (clean slate for new cosi-install run)
* new: add proxy support to circonus-nadpush
* new: standardize on https-proxy-agent for external requests

### 0.7.1 2016-06-14

* new: NAD reverse support (--agent reverse) for OmniOS
* change: default examples to reverse agent

### 0.7.0 2016-06-14

* new: NAD reverse support (--agent reverse) for Linux
* new: Ubuntu 16.04 support
* fix: typo '%' removed from metric name in graph-if
* new: upstream NAD version release 20160607T194451Z-1

### 0.6.0 2016-06-02

* new: honor https_proxy environment setting

### 0.5.0 2016-05-28

* new: add redhat 7.2 x86_64
* -: add versioned cosi-site deployments (for rollback)
* -: ignore versioned cosi-site tgz files
* -: make rpm building part of main package build
* new: re-add --target and --broker command line options.
* -: verify osi-site bin directory
* fix: limit enterprise brokers to "active" only, do not include "provisioned"

### 0.4.0 2016-05-20

* new: add omnios
* new: add vm specific provisioner override (e.g. omnios using shell while others using puppet)
* new: annotate vm specific provisioner setting in example config

### 0.3.0 2016-05-11

 * fix: os detection fix for centos 5
 * fix: typo in init.d script (centos 5)
 * fix: ui urls using api paths  
 * new: site endpoint to serve RPM /install/rpm
 * new: ruleset support (cosi rulesets -h)
 * change: examples separating into basic and advanced

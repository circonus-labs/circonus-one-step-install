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

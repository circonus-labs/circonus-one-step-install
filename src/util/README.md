# Circonus One Step Install utility

Command line tool for managing the current checks, graphs and worksheet created for the current host via COSI.

## Commands

```sh
bin/cosi

bin/cosi check
bin/cosi check list
bin/cosi check fetch
bin/cosi check create

bin/cosi graph
bin/cosi graph list

bin/cosi template
bin/cosi template list
```



## Development

```sh
# global node modules
npm install -g eslint node-check-updates pac
```

```sh
# clone repository
git clone https://github.com/maier/cosi-cli && cd cosi-cli
# initialize
npm install
# build - ensure build environment is functional
make check && make package
```

For development and testing, grab a copy of `/opt/circonus/etc/cosi.json` and `/opt/circonus/cosi/registration` from
a `cosi-install`ed host. (e.g. one of the [cosi](https://github.com/circonus/circonus-onestep-install/example) VMs)

```sh

git clone https://github.com/maier/cosi-cli \
    && cd cosi-cli \
    && npm install \
    && npm dedupe \
    && make \
    && vagrant up \
    && vagrant ssh
```

```sh
🐵 npm run showenv

> cosi-cli@0.1.0 showenv /Users/mgm/src/cosi-cli
> echo "Host system $(uname -srv)" ; vagrant --version ; echo "Virtualbox $(vboxmanage --version)" ; ansible --version ; echo "Node $(node --version)" ; echo 'Global npm modules'; npm ls -g --depth=0; echo 'Local npm modules' ; npm ls --depth=0

Host system Darwin 15.3.0 Darwin Kernel Version 15.3.0: Thu Dec 10 18:40:58 PST 2015; root:xnu-3248.30.4~1/RELEASE_X86_64
Vagrant 1.8.1
Virtualbox 5.0.14r105127
ansible 2.1.0 (devel 36aa89ac7e) last updated 2016/01/18 12:20:44 (GMT -400)
  lib/ansible/modules/core: (detached HEAD fd59dccdd7) last updated 2016/01/18 12:20:44 (GMT -400)
  lib/ansible/modules/extras: (detached HEAD 38dfe23336) last updated 2016/01/18 12:20:44 (GMT -400)
  config file =
  configured module search path = Default w/o overrides
Node v4.3.2
Global npm modules
/Users/mgm/.nvm/versions/node/v4.3.2/lib
├── eslint@2.3.0
├── npm@2.14.12
├── npm-check-updates@2.5.8
└── pac@1.0.0

Local npm modules
cosi-cli@0.1.0 /Users/mgm/src/cosi-cli
├── babel-cli@6.6.5
├── babel-preset-es2015@6.6.0
├── chalk@1.1.1
├── circonusapi2@0.1.7
├── commander@2.9.0
├── dot@1.0.3
├── sprintf-js@1.0.3
├── tape@4.5.1
└── vasync@1.6.3
```

## Custom options

See `example-options.json`.

```sh
{
    "broker": {},
    "checks": {
        "default": {},
        "system": {}
    },
    "graphs": {
        "id": {},
        "default": {}
    }
}
```

* [**broker**] id or list & default
   * id - a specific broker id
   * list - an array of broker ids
   * default - an offset into the broker.list or -1 for random element from the list

* [**checks**] check specific options
  * default - options for all checks
  * check id - options for a specifc check id, currently (system|statsd)

* [**graphs**] graph specific options
  * default - options for all graphs
  * graph id - options for a specifc graph id, currently depends on which metric groups NAD exposes that have COSI templates



---

> Old README content to be merged...

# Circonus One Step Install Utilities

## COSI Registration utility

The registration script cosi-install uses for creating check(s), graphs, and a worksheet. It handles detecting what metrics are
curently available from NAD, fetching default templates, building configurations, and interacting with the Circonus API.

### Installation
### Configuration
### Use

## COSI NAD Pusher daemon

In environments where NAD cannot be contacted by the Circonus broker directly, this utility will **push** metrics
to an [HTTPTrap check](https://login.circonus.com/user/docs/Data/CheckTypes#HTTPTrap). Additionally, there is a go
version (small, less resource consumption) available on [GitHub](https://github.com/maier/circonus-nadpush-go).

### Installation
### Configuration
### Use

## COSI reset utility

Remove items created during registration. For use in testing, development, etc.

It will remove:

1. the item(graph|worksheet|check) via the Circonus API
1. the registration file `/opt/circonus/cosi/registration/registration-...json`
1. the configuration file `/opt/circonus/cosi/registration/config-...json`
1. the configuration template file `/opt/circonus/cosi/registration/template-...json`

It **does not** remove anything installed, e.g. NAD, StatsD, etc. Only the items created via the Circonus API.

### Installation

Installed as part of standard COSI install process.

### Configuration

Uses `/opt/circonus/etc/cosi.json` as its configuration, which is automatically created by the COSI install process.

### Use
```sh
# all
/opt/circonus/cosi/util/bin/cosi-reset.js --all
# worksheet
/opt/circonus/cosi/util/bin/cosi-reset.js --worksheet
# graphs
/opt/circonus/cosi/util/bin/cosi-reset.js --graphs
# check
/opt/circonus/cosi/util/bin/cosi-reset.js --check
```

### Example

```sh
/opt/circonus/cosi/util/bin/cosi-reset.js --all
Deleting worksheet /worksheet/ec7ef56d-170e-44f8-aea5-49f55ff93411 /opt/circonus/cosi/registration/config-worksheet.json /opt/circonus/cosi/registration/registration-worksheet.json
Deleting check /check_bundle/128490 /opt/circonus/cosi/registration/config-check.json /opt/circonus/cosi/registration/registration-check.json
Deleting graph /graph/74667c2d-b6b2-4957-9376-6e352140e4ce /opt/circonus/cosi/registration/config-graph-cpu-0.json /opt/circonus/cosi/registration/registration-graph-cpu-0.json
Deleting graph /graph/89beaf7b-849a-48c9-af81-e5784d883b01 /opt/circonus/cosi/registration/config-graph-disk-0-sda.json /opt/circonus/cosi/registration/registration-graph-disk-0-sda.json
Deleting graph /graph/8328da09-8be6-4b33-aef2-e126999f070f /opt/circonus/cosi/registration/config-graph-fs-0-_dev_shm.json /opt/circonus/cosi/registration/registration-graph-fs-0-_dev_shm.json
Deleting graph /graph/74704b85-1745-47df-9c08-1ce2b2835b1d /opt/circonus/cosi/registration/config-graph-fs-0-_run.json /opt/circonus/cosi/registration/registration-graph-fs-0-_run.json
Deleting graph /graph/100cccd2-dc27-4765-9148-daeff9cb9153 /opt/circonus/cosi/registration/config-graph-fs-0-_sys_fs_cgroup.json /opt/circonus/cosi/registration/registration-graph-fs-0-_sys_fs_cgroup.json
Deleting graph /graph/adbd60f5-1cee-42e6-97b2-2f23adc9b373 /opt/circonus/cosi/registration/config-graph-if-0-enp0s3.json /opt/circonus/cosi/registration/registration-graph-if-0-enp0s3.json
Deleting graph /graph/c2af7843-a640-4001-8e02-a761334b4819 /opt/circonus/cosi/registration/config-graph-if-0-enp0s8.json /opt/circonus/cosi/registration/registration-graph-if-0-enp0s8.json
Deleting graph /graph/b932bb96-5d08-4a56-9d6c-337cc152908b /opt/circonus/cosi/registration/config-graph-if-1-enp0s3.json /opt/circonus/cosi/registration/registration-graph-if-1-enp0s3.json
Deleting graph /graph/b3d408e0-3179-459f-8a31-50118bb588b9 /opt/circonus/cosi/registration/config-graph-if-1-enp0s8.json /opt/circonus/cosi/registration/registration-graph-if-1-enp0s8.json
Deleting graph /graph/e16f83e2-ca7e-44d7-a001-d705fd373131 /opt/circonus/cosi/registration/config-graph-vm-0.json /opt/circonus/cosi/registration/registration-graph-vm-0.json
Deleting graph /graph/b11dc54d-f501-4434-ad86-7d4324041389 /opt/circonus/cosi/registration/config-graph-vm-1.json /opt/circonus/cosi/registration/registration-graph-vm-1.json
```

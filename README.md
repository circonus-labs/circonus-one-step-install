# COSI - The Circonus One Step Installer

The purpose of COSI is to simplify the task of getting metrics
flowing from a new host into Circonus.

## Quickstart

1. Log into your Circonus Account

1. Go to the Checks page, click `[NEW HOST+]` on the top right.

1. Copy and run the command displayed on the host to be setup.

![Add Host Screenshot](https://cloud.githubusercontent.com/assets/2446981/20178396/38eeeec2-a751-11e6-93a1-1f3e828827c4.png)

## Description

The purpose of COSI is to simplify the task of getting metrics flowing
from a new host into Circonus, consisting of:

1. Install and configure the Circonus monitoring agent
   [nad](https://github.com/circonus-labs/nad)
1. Create and configure a Circonus check that receives data from the
   agent
1. Create graphs and worksheets for each of the basic metric groups
   (e.g. cpu, memory, disk, network, filesystem, etc.)

COSI automates all these steps with a single cut-n-paste command
without inhibiting customization and orchestration/automation.

This repository contains the following components:

* [COSI installer](https://github.com/circonus-labs/circonus-one-step-install/wiki/Installer).
  A shell script that interacts with the COSI site API.

* [COSI utility](https://github.com/circonus-labs/circonus-one-step-install/tree/master/src/util).
  A command line utility for configuring metrics, checks, graphs and worksheets created by COSI.

* [COSI site](https://github.com/circonus-labs/circonus-one-step-install/tree/master/src).
  A Node.js-based service that serves the COSI installer itself,
  templates, and pointers to NAD packages. Most users will rely on the
  hosted COSI site provided by Circonus (<https://onestep.circonus.com>).

The [COSI user documentation](https://github.com/circonus-labs/circonus-one-step-install/wiki)
is in the wiki for this repository. The documentation contained here
pertains to the repository itself.

---

## How to run COSI Site

Read on, if you need to run an internal COSI site for my
infrastructure which cannot reach the public COSI site hosted by
Circonus.

## Installer Examples

The [example/](example/) directory contains local VM examples of using the installer to setup a new "host". This includes CentOS 7.2, CentOS 6.7, Ubuntu 14.04, and Ubuntu 12.04. (See [README](example/) and [Vagrantfile](example/Vagrantfile) in the directory.)


## Demo Example

The [demo/](demo/) directory contains a Vagrantfile defining VMs to run both cosi-site and clients (CentOS 7 and Ubuntu 14) for the installer locally for the purposes of demonstration. (See [README](demo/) and [Vagrantfile](demo/Vagrantfile) in the directory.)


## Docker container

The [docker/](docker/) directory contains configurations needed to create a cosi-site Docker container. (See [README](docker/) in the directory.)


## Provisioning

The [provision/](provision/) directory contains everything needed to provision cosi-site using [Ansible](http://ansible.com/). The [live COSI site](https://onestep.circonus.com) and the Vagrantfiles in this directory and the demo directory all use this provisioning configuration. (See [README](provision/) in the directory.)


## Testing

The [test/](test/) directory contains a test suite for cosi-site. (See [README](test/) in the directory.)

## Development

Environment:

```sh
ansible --version && vagrant -v && vboxmanage --version

ansible 2.1.0 (devel 9bb069f873) last updated 2016/04/18 12:42:14 (GMT -400)
  lib/ansible/modules/core: (detached HEAD 5409ed1b28) last updated 2016/04/18 12:42:15 (GMT -400)
  lib/ansible/modules/extras: (detached HEAD 3afe117730) last updated 2016/04/18 12:42:15 (GMT -400)
  config file =
  configured module search path = Default w/o overrides
Vagrant 1.8.1
5.0.20r106931
```

> Note: Vagrant is used in the build process to create an RPM for RHEL systems. Supported OSes for building cosi are CentOS, Ubuntu and OSX (what Vagrant supports).

```sh
# get the source, change the URL if you're using a forked copy
git clone https://github.com/circonus-labs/circonus-one-step-install

# install global NPM packages (if you will be using 'make check' or want linting in an editor supporting eslint)
npm install -g eslint npm-check-updates

# install local development and production NPM packages
cd circonus-one-step-install/src
make init

# build the cosi-site package for deployment
make package
```

The `demo/` directory contains a full working cosi-site and several cosi client VM definitions. The cosi-site VM will be provisioned from what is built locally.

```sh
# from repo root
cd demo
vagrant up site
```

Select a client to test with (CentOS `c7`, Ubuntu `u14`, OmniOS `omnios`).

```sh
vagrant up c7
```

Once the client is up you can ssh into it (e.g. `vagrant ssh c7`) and run a cosi install command.

To test changes made to the local source tree on a running cosi-site VM:

```sh
# from the demo/ subdirectory
cd ../src && make package && cd ../demo && vagrant provision site
```

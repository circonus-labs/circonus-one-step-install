# COSI Site

## How to run COSI Site

Read on, if you need to run an internal COSI site for your infrastructure which cannot reach the public COSI site hosted by Circonus.

### Installer Examples

The [/example](/example) directory contains local VM examples of using the installer to setup a new "host". This includes CentOS 7.2, CentOS 6.7, Ubuntu 14.04, and Ubuntu 12.04. (See [README](example/) and [Vagrantfile](example/Vagrantfile) in the directory.)


### Demo Example

The [/demo](/demo) directory contains a Vagrantfile defining VMs to run both cosi-site and clients (CentOS 7 and Ubuntu 14) for the installer locally for the purposes of development and demonstration. (See [README](demo/) and [Vagrantfile](demo/Vagrantfile) in the directory.)


### Docker container

The [/docker](/docker) directory contains configurations needed to create a cosi-site Docker container. (See [README](/docker) in the directory.)


### Provisioning

The [/provision](/provision) directory contains everything needed to provision cosi-site using [Ansible](http://ansible.com/). The [live COSI site](https://onestep.circonus.com) and the Vagrantfiles in this directory and the demo directory all use this provisioning configuration. (See [README](provision/) in the directory.)

# Development

Since COSI supports a variety of different platforms, we make extensive use of Vagrant to create
disposable VMs for testing client software, hosting shared services (COSI site) and building
packages.

## Environment

We use the following environment for developing COSI Site

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

## Building

Vagrant is used in the build process to create an RPM for RHEL systems.
Supported OSes for building cosi are CentOS, Ubuntu and OSX (what Vagrant supports).


```sh
# get the source, change the URL if you're using a forked copy
git clone https://github.com/circonus-labs/circonus-one-step-install

# install global NPM packages (if you will be using 'make check' or want linting in an editor supporting eslint)
npm install -g eslint npm-check yarn

# install npm packages
cd circonus-one-step-install/src
make init

# build the cosi-site package for deployment
make package
```

## Testing

The [/demo](/demo) directory contains a full working cosi-site and several cosi client VM definitions.
Most development of COSI is done within this directory.

## Test Suite

The [/test](/test) directory contains a test suite for cosi-site. (See [README](/test) in the directory.)

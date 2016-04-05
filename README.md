# Circonus One Step Installer

## Documentation

The [COSI user documentation](https://github.com/circonus/circonus-one-step-install/wiki) is in the wiki for this repository. The documentation contained here pertains to the repository itself.

## TL;DR _quick start_

1. Go to the [API Tokens](https://login.circonus.com/user/tokens) page. If there are no tokens listed, click the **New API Token** button to create one.
2. Click the (i) information icon next to the token to use it.
3. Copy and run the command displayed on the host to be setup.

For more information [see the documentation](https://github.com/circonus/circonus-one-step-install/wiki).

---

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


## Environment

The environment used for development:

### main source

```sh
cd src && npm run showenv

> cosi-site@1.0.0 showenv ~/src/circonus/circonus-one-step-install/src
> echo "Host system $(uname -srv)" ; vagrant --version ; echo "Virtualbox $(vboxmanage --version)" ; ansible --version ; echo "Node $(node --version)" ; echo "NPM $(npm --version)" ; echo 'Global npm modules'; npm ls -g --depth=0; echo 'Local npm modules' ; npm ls --depth=0

Host system Darwin 15.3.0 Darwin Kernel Version 15.3.0: Thu Dec 10 18:40:58 PST 2015; root:xnu-3248.30.4~1/RELEASE_X86_64
Vagrant 1.8.1
Virtualbox 5.0.14r105127
ansible 2.1.0 (devel 36aa89ac7e) last updated 2016/01/18 12:20:44 (GMT -400)
  lib/ansible/modules/core: (detached HEAD fd59dccdd7) last updated 2016/01/18 12:20:44 (GMT -400)
  lib/ansible/modules/extras: (detached HEAD 38dfe23336) last updated 2016/01/18 12:20:44 (GMT -400)
  config file =
  configured module search path = Default w/o overrides
Node v4.4.1
NPM 2.14.20
Global npm modules
~/.nvm/versions/node/v4.4.1/lib
├── eslint@2.5.1
├── express-generator@4.13.1
├── npm@2.14.20
├── npm-check-updates@2.6.1
└── pac@1.0.0

Local npm modules
cosi-site@1.0.0 ~/src/circonus/circonus-one-step-install/src
├── bunyan@1.8.0
├── commander@2.9.0
├── node-statsd@0.1.1
├── restify@4.0.4
└── tape@4.5.1
```

### util source

```sh
cd src/util && npm run showenv

> cosi-cli@0.1.0 showenv ~/src/circonus/circonus-one-step-install/src/util
> echo "Host system $(uname -srv)" ; vagrant --version ; echo "Virtualbox $(vboxmanage --version)" ; ansible --version ; echo "Node $(node --version)" ; echo 'Global npm modules'; npm ls -g --depth=0; echo 'Local npm modules' ; npm ls --depth=0

Host system Darwin 15.3.0 Darwin Kernel Version 15.3.0: Thu Dec 10 18:40:58 PST 2015; root:xnu-3248.30.4~1/RELEASE_X86_64
Vagrant 1.8.1
Virtualbox 5.0.14r105127
ansible 2.1.0 (devel 36aa89ac7e) last updated 2016/01/18 12:20:44 (GMT -400)
  lib/ansible/modules/core: (detached HEAD fd59dccdd7) last updated 2016/01/18 12:20:44 (GMT -400)
  lib/ansible/modules/extras: (detached HEAD 38dfe23336) last updated 2016/01/18 12:20:44 (GMT -400)
  config file =
  configured module search path = Default w/o overrides
Node v4.4.1
Global npm modules
~/.nvm/versions/node/v4.4.1/lib
├── eslint@2.5.1
├── express-generator@4.13.1
├── npm@2.14.20
├── npm-check-updates@2.6.1
└── pac@1.0.0

Local npm modules
cosi-cli@0.1.0 ~/src/circonus/circonus-one-step-install/src/util
├── babel-cli@6.6.5
├── babel-preset-es2015@6.6.0
├── chalk@1.1.3
├── circonusapi2@0.1.7
├── commander@2.9.0
├── dot@1.0.3
├── ora@0.2.1
├── sprintf-js@1.0.3
└── tape@4.5.1
```

# Circonus One Step Installer

## Documentation

The [COSI user documentation](https://github.com/circonus-labs/circonus-one-step-install/wiki) is in the wiki for this repository. The documentation contained here pertains to the repository itself.

## TL;DR _quick start_

1. Go to the [API Tokens](https://login.circonus.com/user/tokens) page. If there are no tokens listed, click the **New API Token** button to create one.
2. Click the (i) information icon next to the token to use it.
3. Copy and run the command displayed on the host to be setup.

For more information [see the documentation](https://github.com/circonus-labs/circonus-one-step-install/wiki).

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

# install global NPM packages
npm install -g eslint pac npm-check-updates

# install local development and production NPM packages
cd circonus-one-step-install/src
npm install
cd util
npm install
cd ..

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

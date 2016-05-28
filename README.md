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



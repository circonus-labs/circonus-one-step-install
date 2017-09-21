# COSI Demo

This directory contains a Vagrantfile defining VMs to run both cosi-site and clients (CentOS, Ubuntu, etc.) for the installer locally for the purposes of development, learning, testing customizations, and demonstration. (See the [Vagrantfile](/demo/Vagrantfile) in this directory.)

## Environment

* Circonus account ([Sign up for a free account](http://www.circonus.com/lp/free-account/))
* [Vagrant](https://www.vagrantup.com/)
* [Virtualbox](https://www.virtualbox.org/)
* [NodeJS](https://nodejs.org/en/)
* [Ansible](http://docs.ansible.com/ansible/intro_installation.html)

## Prerequisite

Build the COSI-Site package for the Ansible provisioning configuration.

```sh
# from demo/ directory
cd ../src
make init
make package
cd -
```

See the [COSI Site README](/src) for more information about building the COSI site.

## Setup

For COSI development, you will need:

- A circonus account
- A local version of the COSI site
- Client VM for testing the COSI installer

### Start a COSI site VM

The cosi-site VM will be provisioned from what is built locally.

```sh
# from repo root
cd demo
vagrant up site
```

This host will be visible as `cosi-site` from the client VMs.

### Start a client VM

Bring up a client VM [at least one, see the Vagrantfile for all of the client options]:
* CentOS 7: `vagrant up c7`
* Ubuntu 14: `vagrant up u14`
* OmniOS r151014: `vagrant up omnios`

Once the client is up you can ssh into it (e.g. `vagrant ssh c7`) and run a cosi installer.

### Get a Circonus API Token

The COSI client will install Checks and Graphs into a Circonus SaaS account. In order to do so, it
needs an API token. You can copy-paste the API token and the API App name from the `[+New Host]`
button on the checks page (under `--key` and `--app`) or create a new one as follows:

1. Log into Circonus and navigate to the [API Tokens](https://login.circonus.com/user/tokens) page.
1. If there are no API tokens, click the **New API Token+** button in upper right corner.
1. Make sure the "Default App State" is set to "Allow"
1. Select and copy the `token` value from the displayed command.

### Run the COSI Installer

Replace `<token app name value>` with the one copied from above or `cosi` if a new token was created with default app state set to allow. Replace `<token key value>` with the token copied.

```sh
[vagrant@cosi-c7-a3982610d ~]$ sudo -i
[root@cosi-c7-a3982610d ~]# curl -sSL 'http://cosi-site/install' | bash -s -- \
   --cosiurl http://cosi-site/ \
   --app <token app name value> \
   --key <token key value>
```

This will download the installation script from the cosi-site VM and run it in bash. Resulting in the following:

* Verify the OS is supported
* Download the Circonus Agent (NAD) package
* Install NAD
* Download the COSI utilities
* Unpack the COSI utilities
* Run the registration utility on the host
* Download check, graph, and worksheet configuration templates
* Create check, graph, and worksheet configurations based on the local host
* Call the Circonus API to create[aka register] the host
* Create a check
* Enable available metrics (from NAD)
* Create a set of default graphs
* Create a worksheet containing the default graphs
* Output the graph, check, and worksheet URLs (using the main `/opt/circonus/cosi/bin/cosi` utility)
* Notes:
* NAD is installed in `/opt/circonus`
* The COSI utilities are installed in `/opt/circonus/cosi`
* The log from the installation/registration is `/opt/circonus/cosi/log/install.log`
* For more information see the [repository wiki](https://github.com/circonus-labs/circonus-one-step-install/wiki)

### Update site

To test changes made to the local source tree on a running cosi-site VM:

```sh
# from the demo/ subdirectory
cd ../src && make package && cd ../demo && vagrant provision site
```

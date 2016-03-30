# COSI Demo

## Environment

* Circonus account ([Sign up for a free account](http://www.circonus.com/lp/free-account/))
* [Vagrant](https://www.vagrantup.com/)
* [Virtualbox](https://www.virtualbox.org/)
* [NodeJS](https://nodejs.org/en/) *v4.4.1*
* [Ansible](http://docs.ansible.com/ansible/intro_installation.html)

## Prerequisite

Build the COSI-Site package for the Ansible provisioning configuration.

```sh
# from demo/ directory
cd ../src && make package && cd -
```

## Run demo

### Setup

1. Get Circonus API Token and App
   1. Log into Circonus and navigate to the [API Tokens](https://login.circonus.com/user/tokens) page.
   1. If there are no API tokens, click the **New API Token+** button in upper right corner.
   1. Click the (i) icon next to a token to display the *Circonus One Step Install* command.
   1. Select and copy the `key` and `app` values from the displayed command.
1. Start VMs
	1. Bring up cosi-site. `vagrant up site`
	1. Bring up client(s) [at least one]:
		* CentOS 7: `vagrant up c7`
    	* Ubuntu 14: `vagrant up u14`
1. SSH into client `vagrant ssh c7` or `vagrant ssh u14` and become root `sudo -i`.


### Run the *Circonus One Step Install* command

```sh
[vagrant@cosi-c7-a3982610d ~]$ sudo -i
[root@cosi-c7-a3982610d ~]# curl -sSL 'http://cosi.circonus.com/install' | bash -s -- \
    --cosiurl http://cosi.circonus.com/ \
    --agent push \
    --app <value copied above> \
    --key <value copied above>
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
	* Start `circonus-nadpush`, if the *mode* is "push"
	* Output the graph, check, and worksheet URLs (using the main `/opt/circonus/cosi/bin/cosi` utility)
* Notes:
    * NAD is installed in `/opt/circonus`
    * The COSI utilities are installed in `/opt/circonus/cosi`
    * The log from the installation/registration is `/opt/circonus/cosi/log/install.log`
    * For more information see the [repository wiki](https://github.com/circonus-labs/circonus-one-step-install/wiki)

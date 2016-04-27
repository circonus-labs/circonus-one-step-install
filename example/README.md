# Vagrant COSI examples

- [x] CentOS 7.2.1511 x86_64
- [x] ~~CentOS 7.1.1503 x86_64~~
- [x] CentOS 6.7 x86_64
- [x] CentOS 6.6 x86_64 (Vagrantfile.puppet uses Puppet v4.2.2)
- [x] ~~CentOS 6.3 x86_64~~
- [x] Ubuntu 14.04 x86_64 (trusty)
- [x] Ubuntu 12.04 x86_64 (precise)

> There have not been any tests of **32 bit** distros done yet (2015.02.26). Are there still good sized footprints of 32bit systems in production deployments?

## Environment

* [Vagrant](https://www.vagrantup.com/downloads.html)
* [Virtualbox](https://www.virtualbox.org/wiki/Downloads)

```sh
⁖ vagrant --version ; vboxmanage --version
Vagrant 1.8.1
5.0.14r105127
```

## Use

### Initial setup -- Ansible provisioning

1. Install the software listed under the Environment section above.
1. Link the Ansible Vagrantfile, `ln -s Vagrantfile.ansible Vagrantfile`.
1. Install [Ansible](http://docs.ansible.com/ansible/intro_installation.html), v2.1.0 used to build examples.
1. Set up Ansible variables specific to the Circonus account `ansible/group_vars/all.yml`.
   1. Copy `cd ansible/group_vars && cp all.yml.example all.yml`
   1. Open new `all.yml` in an editor
   1. Log into Circonus and navigate to the [API Tokens](https://login.circonus.com/user/tokens) page.
   1. If there are no API tokens, click the **New API Token+** button in upper right corner.
   1. Click the **(i)** next to the token to use, from the command displayed: ***
      1. Copy the `--key` value, paste into `all.yml` as the value for `cosi_api_token`
      1. Copy the `--app` value, paste into `all.yml` as the value for `cosi_api_app`
   1. Save changes to `all.yml`

### Initial setup -- Puppet provisioning

1. Install the software listed under the Environment section above.
1. Link the Puppet Vagrantfile, `ln -s Vagrantfile.puppet Vagrantfile`.
1. Set up variables specific to the Circonus account
   1. Copy `example-config.rb` to `config.rb` and open in an editor.
   1. Log into Circonus and navigate to the [API Tokens](https://login.circonus.com/user/tokens) page.
   1. If there are no API tokens, click the **New API Token+** button in upper right corner.
   1. Click the **(i)** next to the token to use, from the command displayed: ***
      1. Copy the `--key` value, paste into `config.rb` as the value for `KEY`
      1. Copy the `--app` value, paste into `config.rb` as the value for `APP`
   1. Save changes to `config.rb`

### Starting

```sh
vagrant up <vm name>

vagrant up (centos7.2|centos6.7|ubuntu14|ubuntu12)

#e.g.

vagrant up ubuntu14

```

See expected result in [eg/](eg/) directory.


### Troubleshooting

Details for inspecting/troubleshooting the installation can be found on the running VM (`vagrant ssh <vm name>`) in:

* `/opt/circonus/cosi/log/install.log`


### Customize

1. Install COSI hook for _NAD post install_ - all
1. Install new NAD plugin - all (load.sh)
1. Disable NAD plugin - all (diskstats.sh)
1. Install modified NAD plugin - (vm.sh) centos7* VMs
1. Replace NAD plugin - (fs.elf w/ df.sh) centos7* VMs
1. Install custom graph template - (fs.json) ubuntu VMs

> See the various files in the [cosi role](provision/rolse/cosi) of the Ansible provisioning playbook for more details on each customization.


### Destroy

```sh
./destroy.sh <vm name>

./destroy.sh (centos7.2|centos6.7|ubuntu14|ubuntu12)
```

**Q:** Why is there a script to perform this when `vagrant destroy` will work?

**A:** Using the script will also run `/opt/circonus/cosi/bin/cosi reset --all`. This utility will remove any items created (graphs, worksheet, check) for the VM that will no longer be sending metrics. To avoid having to remove all of the items manually in the Circonus UI, it is a convenience script.


### Example output

See expected result in [eg/](eg/) directory.

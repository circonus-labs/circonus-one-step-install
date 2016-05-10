# COSI examples

Demonstrate leveraging COSI through shell commands, Ansible, and Puppet.

## Environment

* [Vagrant](https://www.vagrantup.com/downloads.html) (v1.8.1)
* [Virtualbox](https://www.virtualbox.org/wiki/Downloads) (v5.0.20r106931)
* Optional, install [Ansible](http://docs.ansible.com/ansible/intro_installation.html) (v2.1.0)

## Use

There are two sets of examples *basic* and *advanced*. The basic examples demonstrate the basic orchestration of COSI with no additional options. The advanced examples illustrate installing a hook, updating NAD plugins, using custom registration information, etc.

### Preparation

Setup environment and create a configuration file for Vagrant so, it can correctly configure and run each type of provisioner.

1. Install the software listed under the Environment section above.
1. Select either basic or advanced and change to that directory.
1. Set up variables specific to the Circonus account
   1. From the basic or advanced subdirectory, copy `../example-config.yaml` to `config.yaml` and open in an editor.
   1. Log into Circonus and navigate to the [API Tokens](https://login.circonus.com/user/tokens) page.
   1. If there are no API tokens, click the **New API Token+** button in upper right corner.
   1. Click the **(i)** next to the token to use, from the command displayed: ***
      1. Copy the `--key` value, paste into `config.yaml` as the value for `api_key`
      1. Copy the `--app` value, paste into `config.yaml` as the value for `api_app`
   1. Set `provisioner` to be one of "ansible", "puppet", or "shell". (Note: Ansible must be installed locally if the provisioner is set to "ansible". Puppet will be installed on the VM as it is created.)
   1. Enable at least *one* of the VMs.
   1. Save changes to `config.yaml`

### Starting

Run `vagrant up`, or, if more than one VM has been enabled, `vagrant up <vm name>`. To see a list of the enabled VMs run, `vagrant status`. Vagrant will download (if needed, the box), import it, start it, and run the applicable provisioner. If the provisioner is set to "manual", nothing automatic will occur. In this case, `vagrant ssh` into the VM, become root `sudo -i`, and run the COSI command from the Tokens page in the UI directly.

### Troubleshooting

Details for inspecting/troubleshooting the installation can be found on the running VM (`vagrant ssh <vm name>`) in:

* `/opt/circonus/cosi/log/install.log`

### Destroy

There is a script named `destroy.sh` in the root example directory. Using this to remove VMs, whether started in basic or advanced directories, will make cleanup much easier.

```sh
../destroy.sh <vm name>

# e.g.
../destroy.sh centos7.2
```

**Q:** Why is there a script to perform this when `vagrant destroy` will work?

**A:** Using the script will also run `/opt/circonus/cosi/bin/cosi reset --all`. This utility will remove any items COSI created (graphs, worksheet, checks, rulesets, etc.) for the VM that will no longer be sending metrics. To avoid having to remove all of the items manually in the Circonus UI, it is a convenience script.

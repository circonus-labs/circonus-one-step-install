# Circonus One Step Install (COSI) examples

Demonstrate running COSI on various operating systems using several different types of automation/orchestration methods. There are two sets of examples *basic* and *advanced*. The basic examples demonstrate the COSI process using the default options. The advanced examples illustrate customizing the COSI process with installing a hook, updating NAD plugins, using a custom registration configuration, etc.

#### OS Options

* CentOS (6.3, 6.6, 6.7, 7.1.1503, 7.2.1511)
* Ubuntu (12.04-trusty, 14.04-precise)
* OmniOS (r151014)
* Debian (7.11, 8.7)

#### Automation Options (provisioner)

* Manual
* Shell
* Ansible
* Puppet
* **coming soon**: Chef

> Note on **manual** provisioner:
>
> Simply spins up the VM and **does not** attempt to run COSI. The main purpose of this provisioner is to provide a set of pre-defined platforms for testing the cut-n-paste COSI command from the [API Tokens](https://login.circonus.com/user/tokens) page.
>
> Since the resulting *system* will be a VM leveraging the host's network connection, adding the `--agent push` option to the COSI command line is **strongly encouraged**.

## Prerequisites

* [Vagrant](https://www.vagrantup.com/downloads.html) (v1.8.1)
* [Virtualbox](https://www.virtualbox.org/wiki/Downloads) (v5.0.20r106931)
* Optional, [Ansible](http://docs.ansible.com/ansible/intro_installation.html) (v2.1.0)


## Configuration

1. Copy `example-config.yaml` to `config.yaml`.
1. Open `config.yaml` in an editor.
1. Set up variables specific to the Circonus account:
   1. Log into the [Circonus API Tokens](https://login.circonus.com/user/tokens) page. If there are no API tokens, click **New API Token** in upper right corner.
   1. Click the **(i)** next to the token to use and from the COSI command displayed in the overlay:
      1. Copy the `--key` value, paste into `config.yaml` as the value for `api_key`
      1. Copy the `--app` value, paste into `config.yaml` as the value for `api_app`
1. Set `provisioner` to be one of "ansible", "manual", "puppet", or "shell". The default is "manual". (Note: Ansible must be installed locally if the provisioner is set to "ansible". Puppet will be installed on the VM as it is created.)
1. Enable at least *one* of the VMs.
1. Save all of the changes to `config.yaml`.


## Using

1. Select either *basic* or *advanced*.
2. Change to that directory `cd basic` or `cd advanced`.
3. Copy config.yaml created in Configuration section above, `cp ../config.yaml .` or create a symlink to use the same configuration in both basic and advanced directories `ln -s ../config.yaml`
4. If necessary, make any changes to config.yaml, e.g. enable/disable VMs, etc.
5. Run `vagrant up` to start. If more than one VM has been enabled, optionally, run `vagrant up <vm name>` to start a specific VM.

#### List available VMs

`vagrant status`

#### Log into VM

`vagrant ssh` or `vagrant ssh <vm name>`


#### Halting a VM

This will **stop** the VM, it can be restarted using `vagrant up`.

`vagrant halt` or `vagrant halt <vm name>`

#### Destroying a VM

There is a script named `destroy.sh` in the root example directory. Using this to destroy/remove VMs, whether started in basic or advanced directories, will make cleanup much easier. Although Vagrant has a *destroy* command, it does not know about the checks, graphs, worksheets, etc. that COSI created in Circonus. The destroy script will run a command (`/opt/circonus/cosi/bin/cosi reset --all`) on the VM which will remove these artifacts so that they do not have to be manually deleted in the Circonus UI.

`../destroy.sh <vm name>` note, in this case the specific VM to be destroyed is required.

## Example

```sh
# after setting up config.yaml ('centos7.2' was only vm enabled)

cd basic
ln -s ../config.yaml

vagrant up
# vagrant brings up the 'centos7.2' vm based upon settings in config.yaml

../destroy.sh centos7.2

# 1. 'centos7.2' is verified to be running.
# 2. cosi reset command is run on the vm to remove all artifacts created in Circonus.
# 3. the vagrant destroy command is run to remove the vm.
```

## Troubleshooting

Details for inspecting/troubleshooting the COSI process can be found on the running VM (`vagrant ssh <vm name>`) in:

* `/opt/circonus/cosi/log/install.log`

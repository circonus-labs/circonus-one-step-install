# COSI examples (basic)

The examples contained in this directory do a simple *host* setup using COSI. As Vagrant brings up each VM, COSI is run via the selected provisioner to setup the VM and *register* it with the Circonus account associated with the API token used.

1. Follow the instructions in [top README](../README.md) to setup the environment for the examples and creating `config.yaml`.
2. Copy or symlink `../config.yaml` (unless it was created in this directory).
3. Ensure there is at least **one** VM marked as *enabled* in `config.yaml`.
4. Run `vagrant up` or `vagrant up <vm name>` to start a specific VM.


Vagrant will download (if needed) the vagrant box defined in the VM configuration and start it. Once the VM comes up, Vagrant will provision it using the configured provisioner. Each of the provisioners will run the COSI installer, using the default options, with the API token in `config.yaml`.

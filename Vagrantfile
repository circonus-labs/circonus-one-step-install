# -*- mode: ruby -*-
# vi: set ft=ruby :

Vagrant.configure(2) do |config|
    config.vm.define 'centos', primary: true do |centos|
        centos.vm.box = 'maier/centos-7.2.1511-x86_64'
        centos.vm.hostname = 'c7-osi-test'
        centos.vm.provider 'virtualbox' do |vb|
            # vb.cpus = 2
            # vb.memory = 2048
        end
        centos.vm.network :forwarded_port, guest: 80, host: 38080
    end

    config.vm.define 'omnios', primary: false, autostart: false do |omnios|
        omnios.vm.box = 'omnios-r151014'
        omnios.vm.hostname = 'omnios-osi-test'
        omnios.vm.provider 'virtualbox' do |vb|
            # vb.cpus = 2
            # vb.memory = 2048
        end
        omnios.vm.network :forwarded_port, guest: 80, host: 38081
    end

    config.vm.define 'ubuntu', primary: false, autostart: false do |ubuntu|
        ubuntu.vm.box = 'ubuntu/trusty64'
        ubuntu.vm.hostname = 'u14-osi-test'
        ubuntu.vm.provider 'virtualbox' do |vb|
            # vb.cpus = 2
            # vb.memory = 2048
        end
        ubuntu.vm.network :forwarded_port, guest: 80, host: 38082
    end

    #
    # common provisioner
    #
    config.vm.provision 'ansible' do |ansible|
        # ansible.verbose = 'vvvv'
        ansible.playbook = 'provision/cosi-site.yml'
    end

end

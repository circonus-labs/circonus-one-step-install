# -*- mode: ruby -*-
# vi: set ft=ruby :

require 'yaml'
require 'digest'

# COSI examples support class
class Examples
    DEFAULT_COSI_URL = 'https://onestep.circonus.com/'
    DEFAULT_API_URL = 'https://api.circonus.com/'
    DEFAULT_AGENT_MODE = 'reverse'
    HOSTNAME = `hostname`

    def initialize(config_file)
        @config_file = config_file
        load_config_file
        check_options
    end

    attr_reader :options

    def vm_hostname(id)
        sig = Digest::SHA2.hexdigest("#{HOSTNAME}-cosi-#{id}")[0..8]
        "cosi-#{id}-#{sig}"
    end

    #
    # Ansible
    #
    def provision_ansible(bx)
        bx.vm.provision 'ansible' do |ansible|
            ansible.extra_vars = {
                'cosi_install_url' => "#{@options['cosi_url']}/install",
                'cosi_install_args' => @options['cosi_args']
            }
            ansible.playbook = 'ansible/client.yml'
        end
    end

    #
    # Puppet
    #
    def install_puppet_rpm(bx, pkg)
        bx.vm.provision 'shell', inline: <<-SHELL
            [[ -f /etc/pki/rpm-gpg/RPM-GPG-KEY-puppetlabs-PC1 ]] || {
                rpm -U https://yum.puppetlabs.com/#{pkg}
                yum -q -e 0 makecache fast
            }
            [[ -x /opt/puppetlabs/bin/puppet ]] || yum -q -e 0 install -y puppet-agent
        SHELL
    end

    def install_puppet_deb(bx, pkg)
        bx.vm.provision 'shell', inline: <<-SHELL
            [[ -x /opt/puppetlabs/bin/puppet ]] || {
                aptitude purge -y puppet
                curl -sSL https://apt.puppetlabs.com/#{pkg} -o #{pkg}
                dpkg -i #{pkg}
                aptitude update -q -q
                apt-get install -y --install-suggests puppet-agent
            }
        SHELL
    end

    def install_puppet(bx, pkg)
        if pkg =~ /\.rpm$/
            install_puppet_rpm(bx, pkg)
        elsif pkg =~ /\.deb/
            install_puppet_deb(bx, pkg)
        end
    end

    def provision_puppet(bx, pkg)
        install_puppet(bx, pkg)
        bx.vm.provision 'puppet' do |puppet|
            puppet.facter = {
                'cosi_install_url' => "#{@options['cosi_url']}/install",
                'cosi_install_args' => @options['cosi_args']
            }
            puppet.binary_path = '/opt/puppetlabs/bin'
            puppet.environment = 'example'
            puppet.environment_path = 'puppet'
        end
    end

    #
    # Shell
    #
    def provision_shell(bx)
        bx.vm.provision 'shell', inline: <<-SHELL
            [[ -f /etc/redhat-release ]] && {
                yum -q -e 0 makecache fast
                yum -q install -y perl
            }
            curl -sSL #{@options['cosi_url']}/install | bash -s -- #{@options['cosi_args']}
        SHELL
    end

    #
    # internal utility methods
    #

    private

    def load_config_file
        unless File.file?(@config_file)
            puts 'ERROR: config file not found.'
            puts "\nSee README.md for instructions to setup '#{@config_file}'"
            exit(1)
        end
        @options = YAML.load_file(@config_file) || {}
    end

    def validate_enabled_vm
        found = false
        @options['vms'].each_value do |vm_def|
            if vm_def['enabled']
                found = true
                break
            end
        end
        return if found
        puts "No 'enabled' VMs found in 'vms', see README.md for instructions."
        exit(1)
    end

    def validate_vm_list
        return validate_enabled_vm if @options.key?('vms') && @options['vms'].is_a?(Hash)
        puts "Invalid config, no 'vms' defined, see README.md for instructions."
        exit(1)
    end

    def validate_provisioner
        @options['provisioner'] = 'manual' unless
            @options['provisioner'] =~ /^(ansible|puppet|shell)$/
    end

    def validate_credentials
        return if @options['provisioner'] == 'manual'

        %w(api_key api_app).each do |key|
            error_message = <<-ERROR_MESSAGE
ERROR: Required setting '#{key}' missing!

Please configure '#{key}' in '#{@config_file}'.
See README.md for instructions.
            ERROR_MESSAGE
            abort(error_message) unless @options.key?(key) && @options[key] !~ /^[ ]*$/
        end
    end

    def validate_cosi_url
        @options['cosi_url'] = DEFAULT_COSI_URL unless
            @options.key?('cosi_url') &&
            @options['cosi_url'] !~ /^[ ]*$/

        @options['cosi_url'] << '/' unless @options['cosi_url'][-1, 1] == '/'
    end

    def validate_api_url
        @options['api_url'] = DEFAULT_API_URL unless
            @options.key?('api_url') &&
            @options['api_url'] !~ /^[ ]*$/

        @options['api_url'] << '/' unless @options['cosi_url'][-1, 1] == '/'
    end

    def validate_agent_mode
        @options['agent_mode'] = DEFAULT_AGENT_MODE unless
            @options.key?('agent_mode') &&
            @options['agent_mode'] !~ /^[ ]*$/
    end

    def make_cosi_args
        args = [
            "--key #{@options['api_key']}",
            "--app #{@options['api_app']}",
            "--agent #{@options['agent_mode']}"
        ]
        args << "--cosiurl #{@options['cosi_url']}" if @options['cosi_url'] != DEFAULT_COSI_URL
        args << "--apiurl #{@options['api_url']}" if @options['api_url'] != DEFAULT_API_URL
        args << '--statsd' if @options['stastd']
        @options['cosi_args'] = args.join(' ')
    end

    def check_options
        validate_vm_list
        validate_provisioner

        return if @options['provisioner'] == 'manual'

        validate_credentials
        validate_cosi_url
        validate_api_url
        validate_agent_mode

        # turn statsd off if it isn't explicity set in config
        @options['statsd'] = false unless @options.key?('statsd')

        make_cosi_args
    end
end

# END

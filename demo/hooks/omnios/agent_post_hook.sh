#!/usr/bin/env bash

set -eu

plugin_dir="/opt/circonus/nad/etc/node-agent.d"
[[ ! -d $plugin_dir ]] && {
    echo "Unable to find NAD plugin directory '$plugin_dir'";
    exit 1;
}
omnios_plugin_dir="${plugin_dir}/omnios"
[[ ! -d $omnios_plugin_dir ]] && mkdir -pv $omnios_plugin_dir

echo "Disabling certain plugins"
#
# remove links to plugins we won't be using
#
# these do not output any information for this vagrant VM
echo "  blank output for vm"
[[ -h "${plugin_dir}/sdinfo.sh" ]] && rm -v "${plugin_dir}/sdinfo.sh"
[[ -h "${plugin_dir}/vnic.sh" ]] && rm -v "${plugin_dir}/vnic.sh"
[[ -h "${plugin_dir}/zone_vfs.sh" ]] && rm -v "${plugin_dir}/zone_vfs.sh"
# not used for demo/example (large numbers of very detailed metrics,
# use based on needs of system utilization profile) no default graphs,
# at this time, use these metrics.
echo "  detailed metrics for specific use cases"
[[ -h "${plugin_dir}/aggcpu.elf" ]] && rm -v "${plugin_dir}/aggcpu.elf"
[[ -h "${plugin_dir}/tcp.sh" ]] && rm -v "${plugin_dir}/tcp.sh"
[[ -h "${plugin_dir}/udp.sh" ]] && rm -v "${plugin_dir}/udp.sh"
# replace iflink: with a plugin which does not conflate multiple metrics
# and does not duplicate interfaces (iface list needs to be sorted
# before piping to uniq.)
# replace vminfo: with plugin that exposes pagesize so that calculations
# can be done using exposed metrics and also pre-calculates
# swap space available for default vm graph.
echo "  replacing"
[[ -h "${plugin_dir}/if.sh" ]] && rm -v "${plugin_dir}/if.sh"
[[ -h "${plugin_dir}/vminfo.sh" ]] && rm -v "${plugin_dir}/vminfo.sh"


for plugin_script in iflink.sh vm.sh; do
    plugin_src="/vagrant/hooks/omnios/${plugin_script}"
    plugin_dst="${omnios_plugin_dir}/${plugin_script}"
    echo
    echo "Instaling $plugin_script"
    if [[ -f $plugin_src ]]; then
        cp -v $plugin_src $plugin_dst
        chmod 755 $plugin_dst
        [[ -h "${plugin_dir}/$plugin_script" ]] && rm "${plugin_dir}/$plugin_script"
        cd $plugin_dir
        ln -s "omnios/${plugin_script}"
    else
        echo "Source $plugin_script file $plugin_src missing, skipping.";
    fi
done

set +e
svcadm restart nad
set -e

# give the restart a little breathing room
sleep 2

# echo "Installing example ruleset"
# mkdir -pv /opt/circonus/cosi/rulesets
# cp -v /vagrant/hooks/c7/ruleset-load.json /opt/circonus/cosi/rulesets/load.json

## END

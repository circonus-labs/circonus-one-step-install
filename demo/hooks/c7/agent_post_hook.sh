#!/usr/bin/env bash

set -eu

dst_dir="/opt/circonus/etc/node-agent.d/linux"
[[ ! -d "$dst_dir" ]] && { echo "Unable to find DEST directory '${dst_dir}'"; exit 1; }

# install additional nad plugins

cd $dst_dir

echo "Install meminfo.sh (instead of vm.sh which reports incorrectly for CentOS 7)"
curl -sSL "https://raw.githubusercontent.com/maier/circonus-nad-plugins/master/linux/meminfo.sh" -o "${dst_dir}/meminfo.sh"
chmod 755 "${dst_dir}/meminfo.sh"
vm_link="/opt/circonus/etc/node-agent.d/vm.sh"
[[ -h $vm_link ]] && rm $vm_link

echo "Install load.sh for CentOS 7"
curl -sSL "https://raw.githubusercontent.com/maier/circonus-nad-plugins/master/linux/load.sh" -o "${dst_dir}/load.sh"
chmod 755 "${dst_dir}/load.sh"

cd ..
ln -s linux/load.sh .
ln -s linux/meminfo.sh .

set +e
service nad restart
set -e

# give the restart a little breathing room
sleep 2

echo "Installing example ruleset"
mkdir -pv /opt/circonus/cosi/rulesets
cp -v /vagrant/hooks/c7/ruleset-load.json /opt/circonus/cosi/rulesets/load.json

## END

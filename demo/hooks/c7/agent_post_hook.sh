#!/usr/bin/env bash

set -eu

plugin_dir="/opt/circonus/etc/node-agent.d"
[[ ! -d "$plugin_dir" ]] && { echo "Unable to find NAD plugin directory '${plugin_dir}'"; exit 1; }

linux_dir="${plugin_dir}/linux"
[[ ! -d "$linux_dir" ]] && { echo "Unable to find NAD Linux plugin directory '${linux_dir}'"; exit 1; }

# install additional nad plugins

cd $plugin_dir

# install nad memory plugin
echo "Install NAD memory usage metrics plugin"
mkdir -v nadmemory
cp -v /vagrant/hooks/c7/nadmemory.js "${plugin_dir}/nadmemory/nadmemory.js"
ln -s nadmemory/nadmemory.js .

echo "Install load.sh for CentOS 7"
curl -sSL "https://raw.githubusercontent.com/maier/circonus-nad-plugins/master/linux/load.sh" -o "${linux_dir}/load.sh"
chmod 755 "${linux_dir}/load.sh"
ln -s linux/load.sh .

set +e
service nad restart
set -e

# give the restart a little breathing room
sleep 2

echo "Installing example ruleset"
mkdir -pv /opt/circonus/cosi/rulesets
cp -v /vagrant/hooks/c7/ruleset-load.json /opt/circonus/cosi/rulesets/load.json

## END

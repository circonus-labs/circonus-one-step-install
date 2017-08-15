#!/usr/bin/env bash

set -eu

plugin_dir="/opt/circonus/nad/etc/node-agent.d"
[[ ! -d "$plugin_dir" ]] && { echo "Unable to find NAD plugin directory '${plugin_dir}'"; exit 1; }

# install/enable additional nad plugins

cd $plugin_dir

echo "Enabling loadavg (if needed)"
if [[ -f common/loadavg.elf ]]; then
    [[ -h loadavg.elf ]] || ln -s common/loadavg.elf
fi

set +e
service nad restart
set -e

# give the restart a little breathing room
sleep 2

echo "Installing example rulesets"
mkdir -pv /opt/circonus/cosi/rulesets
cp -v /vagrant/hooks/c7/ruleset-analytic-example.json /opt/circonus/cosi/rulesets/cpu-idle.json

## END

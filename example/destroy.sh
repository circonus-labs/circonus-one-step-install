#!/usr/bin/env bash

set -eu

[[ $# -ne 1 ]] && { echo "$0 <vm name>"; exit 1; }

vm="$1"

echo "Checking status of $vm"

status=$(vagrant status $vm)

if [[ $status =~ running ]]; then
    echo "$vm is running"
elif [[ $status =~ poweroff ]]; then
    echo "$vm is not running, start it first"
    exit 1
elif [[ $status =~ not\ created ]]; then
    echo "$vm hasn't been created yet."
    exit 1
else
    echo "unknown state for $vm"
    exit 2
fi

vagrant ssh $vm -c "sudo /opt/circonus/cosi/bin/cosi reset --all"

vagrant destroy $vm

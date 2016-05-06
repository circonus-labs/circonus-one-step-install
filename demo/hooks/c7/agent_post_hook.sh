#!/usr/bin/env bash

set -eu

dst_dir="/opt/circonus/etc/node-agent.d/linux"
[[ ! -d "$dst_dir" ]] && { echo "Unable to find DEST directory '${dst_dir}'"; exit 1; }

# do a little fixup to remove redundant metrics enabled by default in omnibus package

#disk_sh="${dst_dir}/../disk.sh"
#diskstats_sh="${dst_dir}/../diskstats.sh"

# prefer diskstats if it can be used, more flexible (disk is a subset of diskstats)

#if [[ -x "$diskstats_sh" ]]; then
#    set +e
#    "$diskstats_sh" &> /dev/null
#    ret=$?
#    if [[ $ret -eq 0 ]]; then
#        [[ -h "$disk_sh" ]] && rm "$disk_sh"
#    else
#        rm "$diskstats_sh"
#    fi
#    set -e
#else
#    echo "Did not find '${diskstats_sh}'"
#fi

#if [[ -x "$disk_sh" ]]; then
#    # test manually, disk.sh does not exit with an error (@TODO add 'set -e' to disk.sh in nad)
#    if [[ ! -d /sys/block ]]; then
#        # sysfs isn't even available, basically, no disk metrics period
#        set +e
#        rm "$disk_sh"
#        set -e
#    fi
#else
#    echo "Did not find '${disk_sh}'"
#fi


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

## END

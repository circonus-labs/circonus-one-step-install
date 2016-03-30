#!/usr/bin/env bash

set -eu

src_dir="/opt/circonus/cosi/hooks"
dst_dir="/opt/circonus/etc/node-agent.d/linux"

[[ ! -d "$src_dir" ]] && { echo "Unable to find SOURCE directory '${src_dir}'"; exit 1; }
[[ ! -d "$dst_dir" ]] && { echo "Unable to find DEST directory '${dst_dir}'"; exit 1; }

set +e
service nad stop
set -e

# do a little fixup to remove redundant metrics enabled by default in omnibus package

# remove the diskstats symlink, it produces *a lot* of metrics for things that
# are not always actual disks (e.g. ram)
diskstats_sh="${dst_dir}/../diskstats.sh"
[[ -h "$diskstats_sh" ]] && \rm "$diskstats_sh"

# remove the fs.elf symlink, it does not show all of the filesystems for centos vagrant VMs
# e.g.
#[root@cosi-c72-a97e14275 7]# df -h
#Filesystem                       Size  Used Avail Use% Mounted on
#/dev/mapper/centos_centos7-root  8.5G  1.2G  7.4G  14% /
#devtmpfs                         488M     0  488M   0% /dev
#tmpfs                            497M     0  497M   0% /dev/shm
#tmpfs                            497M  6.5M  491M   2% /run
#tmpfs                            497M     0  497M   0% /sys/fs/cgroup
#/dev/sda1                        497M  148M  350M  30% /boot
#vagrant                          465G  277G  189G  60% /vagrant
#tmpfs                            100M     0  100M   0% /run/user/1000
#[root@cosi-c72-a97e14275 7]# /opt/circonus/etc/node-agent.d/fs.elf  | grep f_bsize
#/dev/shm`f_bsize	L	4096
#/run`f_bsize	L	4096
#/sys/fs/cgroup`f_bsize	L	4096
#
fs_elf="${dst_dir}/../fs.elf"
[[ -h "$fs_elf" ]] && \rm "$fs_elf"

# update/install specific scripts

scripts="df vm load"
for script in $scripts; do
    src_file="${src_dir}/${script}.sh"
    dst_file="${dst_dir}/${script}.sh"
    lnk_file="${dst_dir}/../${script}.sh"

    [[ ! -f "$src_file" ]] && { echo "Unable to found SOURCE file '${src_file}'"; exit 1; }

    \cp -v "$src_file" "$dst_file"
    \chmod 755 "$dst_file"
    [[ -h $lnk_file ]] || ln -s "$dst_file" "$lnk_file"
done

set +e
service nad start
set -e

sleep 2

exit 0

## END

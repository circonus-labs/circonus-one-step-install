#!/usr/bin/env bash

set -eu

src_dir="/opt/circonus/cosi/hooks"
dst_dir="/opt/circonus/etc/node-agent.d/linux"
template_dir="/opt/circonus/cosi/registration"

[[ ! -d "$src_dir" ]] && { echo "Unable to find SOURCE directory '${src_dir}'"; exit 1; }
[[ ! -d "$dst_dir" ]] && { echo "Unable to find DEST directory '${dst_dir}'"; exit 1; }
[[ ! -d "$template_dir" ]] && { echo "Unable to find TEMPLATE directory '${template_dir}'"; exit 1; }

set +e
service nad stop
set -e

# do a little fixup to remove redundant metrics enabled by default in omnibus package

# remove the diskstats symlink, it produces *a lot* of metrics for things that
# are not always actual disks (e.g. ram, loop)
diskstats_sh="${dst_dir}/../diskstats.sh"
[[ -h "$diskstats_sh" ]] && \rm "$diskstats_sh"

# update specific scripts

scripts="load"
for script in $scripts; do
    src_file="${src_dir}/${script}.sh"
    dst_file="${dst_dir}/${script}.sh"
    lnk_file="${dst_dir}/../${script}.sh"

    [[ ! -f "$src_file" ]] && { echo "Unable to found SOURCE file '${src_file}'"; exit 1; }

    \cp -v "$src_file" "$dst_file"
    \chmod 755 "$dst_file"
    [[ -h $lnk_file ]] || ln -s "$dst_file" "$lnk_file"
done

templates="fs"
for template in $templates; do
    src_file="${src_dir}/${template}.json"
    dst_file="${template_dir}/template-graph-${template}.json"

    [[ ! -f "$src_file" ]] && { echo "Unable to find SOURCE file '${src_file}'"; exit 1; }

    \cp -v "$src_file" "$dst_file"
done

set +e
service nad start
set -e

sleep 2

exit 0

## END

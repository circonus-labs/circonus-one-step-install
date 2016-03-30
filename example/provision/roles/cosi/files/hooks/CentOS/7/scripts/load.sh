#!/usr/bin/env bash
# verify commands required are available
cmd_list='printf cat'
for cmd in $cmd_list; do
    type -P $cmd &>/dev/null || { echo "$0 required command '${cmd}' not found, exiting."; exit 1; }
done

src_file="/proc/loadavg"

[[ -f "$src_file" ]] || { echo "Metric source not found '${src_file}', exiting."; exit 1; }

set -e

# Print ordinary metrics
print_metric() {
    \printf "%s\tfloat\t%s\n" $1 $2
}

# /proc/loadavg => 0.00 0.03 0.05 2/116 12886
load=($(cat $src_file))

print_metric "1min" ${load[0]}
print_metric "5min" ${load[1]}
print_metric "15min" ${load[2]}

# END

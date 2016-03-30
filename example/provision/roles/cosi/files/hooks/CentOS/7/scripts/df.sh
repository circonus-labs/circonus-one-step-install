#!/usr/bin/env bash
# verify commands required are available
cmd_list='df grep printf tr'
for cmd in $cmd_list; do
    type -P $cmd &>/dev/null || { echo "$0 required command '${cmd}' not found, exiting."; exit 1; }
done

set -e

# Print ordinary metrics
print_metric() {
    \printf "%s\tL\t%s\n" $1 $2
}

while IFS='' read -r line || [[ -n "$line" ]]; do
	fs=($line)
	print_metric "${fs[0]}\`pct_used" ${fs[2]}
	print_metric "${fs[0]}\`pct_inode_used" ${fs[3]}
done < <(\df --output='target,fstype,pcent,ipcent' -l | \grep '^/' | \tr -d '%')

# END

#!/usr/bin/env bash

# Copyright 2016 Circonus, Inc. All rights reserved.
# Use of this source code is governed by a BSD-style
# license that can be found in the LICENSE file.

fail() {
    msg="[ERROR] ${1:-Unknown error}"
    echo $msg && >&2 echo $msg
    exit 1
}

: ${LOG_FILE:=/opt/circonus/cosi/log/plugin-postgres.log}
exec 3>&1 1> >(tee -a $LOG_FILE)

echo "Disabling NAD PostgreSQL plugin scripts $(date)"

cfg_file=${COSI_PLUGIN_CONFIG_FILE:-/opt/circonus/cosi/etc/plugin-postgres.json}
: ${NAD_SCRIPTS_DIR:=/opt/circonus/etc/node-agent.d}
: ${PLUGIN_SCRIPTS_DIR:=$NAD_SCRIPTS_DIR/postgres}

[[ -d $NAD_SCRIPTS_DIR ]] || fail "NAD plugin directory ($NAD_SCRIPTS_DIR) not found."
[[ -d $PLUGIN_SCRIPTS_DIR ]] || fail "PostgreSQL NAD plugin scripts directory ($PLUGIN_SCRIPTS_DIR) not found."

for script in $PLUGIN_SCRIPTS_DIR/*; do
    script_link="${NAD_SCRIPTS_DIR}/$(basename $script)"
    printf "Disabling %s: " $(basename script_link)
    if [[ -h $script_link ]]; then
        rm $script_link
        [[ $? -eq 0 ]] || fail "removing $script_link link"
        echo "removed symlink $script_link"
    else
        echo "no symlink found (this is not an error)"
    fi
done

if [[ -f $cfg_file ]]; then
    echo "Removing configuration $cfg_file"
    rm $cfg_file
    [[ $? -eq 0 ]] || fail "removing $cfg_file"
fi

popid=$(pgrep -n -f 'protocol_observer -wire postgres')
if [[ -n "$popid" ]]; then
    echo "Stopping PostgreSQL protocol_observer"
    kill -p $popid
fi

echo "Done disabling NAD PostgreSQL plugin scripts $(date)"
exit 0
# END

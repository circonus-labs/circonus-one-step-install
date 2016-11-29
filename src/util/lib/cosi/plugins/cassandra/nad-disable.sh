#!/usr/bin/env bash

fail() {
    msg=${1:-Unknown error}
    echo "[ERROR] $msg"
    #[[ -t 1 ]] || >&2 echo $msg
    exit 1
}

echo "Disabling NAD Cassandra plugin scripts $(date)"

cfg_file=${NAD_PLUGIN_CONFIG_FILE:-/opt/circonus/cosi/etc/plugin-cassandra.json}
: ${NAD_SCRIPTS_DIR:=/opt/circonus/etc/node-agent.d}
CASS_SCRIPTS_DIR=$NAD_SCRIPTS_DIR/cassandra

[[ -d $NAD_SCRIPTS_DIR ]] || fail "NAD plugin directory ($NAD_SCRIPTS_DIR) not found."
[[ -d $CASS_SCRIPTS_DIR ]] || fail "Cassandra NAD plugin scripts directory ($CASS_SCRIPTS_DIR) not found."

for script in $CASS_SCRIPTS_DIR/*; do
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

echo "Done disabling NAD Cassandra plugin scripts $(date)"

exit 0

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

echo "Enabling NAD PostgreSQL plugin scripts $(date)"

settings_file=${PLUGIN_SETTINGS_FILE:-/opt/circonus/etc/pg-conf.sh}
cfg_file=${COSI_PLUGIN_CONFIG_FILE:-/opt/circonus/cosi/etc/plugin-postgres.json}
: ${NAD_SCRIPTS_DIR:=/opt/circonus/etc/node-agent.d}
: ${PLUGIN_SCRIPTS_DIR:=$NAD_SCRIPTS_DIR/postgresql}

[[ -d $NAD_SCRIPTS_DIR ]] || fail "NAD plugin directory ($NAD_SCRIPTS_DIR) not found"
[[ -d $PLUGIN_SCRIPTS_DIR ]] || fail "PostgreSQL NAD plugin scripts directory ($PLUGIN_SCRIPTS_DIR) not found"

[[ -s $settings_file ]] || fail "PostgreSQL plugin settings file missing ($settings_file)"
source $settings_file

pgpid="$(pgrep -n -f postgres)"
[[ -n "$pgpid" ]] || fail "PostgreSQL server not detected, skipping setup"

# execute one of the scripts to ensure correct functionality
dbsize="$(${PLUGIN_SCRIPTS_DIR}/pg_db_size.sh | grep postgres)"
[[ $? -eq 0 && -n "$dbsize" ]] || fail "Could not execute test script.  Please configure ${NAD_PLUGIN_SETTINGS_FILE} appropriately and re-run"


# explicit list of scripts to enable - there may be other files in
# the plugin directory which should *not* be treated as scripts
# (tools/utilities, config files, optional scripts, etc.)
plugin_scripts=""
read -r -d '' plugin_scripts <<-2f17fc42839fca05a41430b091f087e2
pg_bgwriter.sh
pg_cache.sh
pg_connections.sh
pg_db_size.sh
pg_locks.sh
pg_protocol_observer.sh
pg_table_stats.sh
pg_transactions.sh
2f17fc42839fca05a41430b091f087e2
enabled_scripts=()

# enable plugin scripts
pushd $NAD_SCRIPTS_DIR >/dev/null
[[ $? -eq 0 ]] || fail "unable to change to $NAD_SCRIPTS_DIR"
for script in $plugin_scripts; do
    printf "Enabling %s: " "${PLUGIN_SCRIPTS_DIR}/${script}"
    if [[ -x $PLUGIN_SCRIPTS_DIR/$script ]]; then
        if [[ -h $script ]]; then
            echo "already enabled"
        else
            ln -s $PLUGIN_SCRIPTS_DIR/$script
            [[ $? -eq 0 ]] || fail "enabling ${PLUGIN_SCRIPTS_DIR}/${script}"
            echo "enabled"
        fi
        enabled_scripts+=(${script%.*})
    else
        echo "not executable, ignoring"
    fi
done
popd > /dev/null

# give nad some time to initialize the scripts (because nodetool is *slow*)
printf "Waiting 30s for NAD to pick up new scripts"
for i in {1..30}; do
    printf "."
    sleep 1
done
echo

# ensure nad is exposing plugin scripts
echo "Testing NAD for expected plugin metrics"
expected=${#enabled_scripts[@]}
found=0
for i in {1..4}; do
    res=$(curl -sS localhost:2609/)
    for x in ${enabled_scripts[*]}; do
        printf "Checking for output from %s: " $x
        has=$(echo $res | grep -c $x)
        if [[ $has -gt 0 ]]; then
            echo "OK"
            ((found++))
        else
            echo "Not found"
        fi
    done
    [[ $found -eq $expected ]] && break
    echo "WARN: not all expected metrics found, attempt $i of 3."
    printf "Waiting 10s for NAD to pick up new scripts"
    for i in {1..10}; do printf "."; sleep 1; done
    echo
done

[[ $found -eq $expected ]] || fail "unable to verify, NAD not exposing expected metrics. ($found:$expected plugin modules)"

echo "Determine PostgreSQL data directory for fs graph"
[[ -n {PGPASS:-} ]] && export PGPASSWORD=$PGPASS
DATA_DIR=$($PSQL_CMD -U $PGUSER -d $PGDATABASE -w -c "show data_directory;" -q -t)
if [[ $? -ne 0 ]]; then
    unset PGPASSWORD
    DATA_DIR=$($PSQL_CMD -U postgres -d $PGDATABASE -w -c "show data_directory;" -q -t)
    [[ $? -eq 0 ]] || {
        DATA_DIR=$(sudo -u postgres $PSQL_CMD -d $PGDATABASE -w -c "show data_directory;" -q -t)
        [[ $? -eq 0 ]] || fail "Unable to determine PostgreSQL data directory"
    }
fi
FS_NAME=""
if [[ -n "$DATA_DIR" ]]; then
    DATA_DIR=$(echo -e "${DATA_DIR}" | tr -d '[[:space:]]')
    FS_NAME=$(df --output=target "$DATA_DIR" | tail -1)
fi

echo "Data directory : $DATA_DIR"
echo "Filesystem name: $FS_NAME"

PROTOCOL_OBSERVER="false"
# default protocol_observer location
po=/opt/circonus/bin/protocol_observer
[[ -x $po ]] || po=$(type -P protocol_observer)
[[ -n "$po" && -x $po ]] && PROTOCOL_OBSERVER="true"

echo "Saving configuration $cfg_file"
cat <<247f3f625cc73f881ca3e9b8c84e0767 > $cfg_file
{
    "enabled": true,
    "fs_mount": "${FS_NAME}",
    "data_dir": "${DATA_DIR}",
    "protocol_observer": ${PROTOCOL_OBSERVER},
    "scripts": "${enabled_scripts[*]}"
}
247f3f625cc73f881ca3e9b8c84e0767

echo "Done enabling NAD PostgreSQL plugin scripts $(date)"
exit 0
# END

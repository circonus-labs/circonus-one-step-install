#!/usr/bin/env bash

# is this always true?
NAD_SCRIPTS_DIR=/opt/circonus/etc/node-agent.d
PG_SCRIPTS_DIR=$NAD_SCRIPTS_DIR/postgresql

# determine if postgres is running
PGPID="$(pgrep -n -f postgres)"
if [ -z "$PGPID" ]; then
    echo "Postgres not detected, skipping setup"
    exit 1;
fi

# pull in the plugin settings
source /opt/circonus/etc/pg-conf.sh

# turn on all postgres stuff (create symlink if it doesn't already exist)
pushd $NAD_SCRIPTS_DIR >/dev/null
for i in $PG_SCRIPTS_DIR/*; do
    ib=$(basename $i)
    [[ -h $ib ]] || ln -s $i .
done

# execute one of the scripts to ensure correct functionality
SIZE="$(./pg_db_size.sh | grep postgres)"
if [ -z "$SIZE" ]; then
    echo "Could not execute a test script.  Please configure /opt/circonus/etc/pg-conf.sh appropriately and re-run"
    for i in $PG_SCRIPTS_DIR/*; do
        rm `basename $i`
    done
    echo "{\"enabled\": false}"
    exit 1
fi

# check for protocol observer (being installed)
POPATH=$(type -P protocol_observer)
PROTOCOL_OBSERVER="false"
if [ -n "$POPATH" ]; then
    PROTOCOL_OBSERVER="true"
fi

# obtain the database directory and subsequent filesystem on which that directory resides
DATA_DIR=$(psql -w -c "show data_directory;" -q -t)
FS_NAME=""
if [[ -n "$DATA_DIR" ]]; then
    DATA_DIR=$(echo -e "${DATA_DIR}" | tr -d '[[:space:]]')
    FS_NAME=$(df --output=target "$DATA_DIR" | tail -1)
fi

popd >/dev/null

# ensure nad is exposing some of the new metrics
found=0
for i in {0..10}; do
    res=$(curl -sS localhost:2609/run/pg_db_size | grep -c '_value')
    if [[ $res -gt 0 ]]; then
        found=1
        break
    fi
    sleep 1
done

if [[ found -eq 0 ]]; then
    echo "{\"enabled\": false }"
    exit 1
fi

# if we have arrived here, the postgres plugin in NAD is installed and operating
echo "{\"enabled\": true, \"fs_mount\": \"${FS_NAME}\", \"data_dir\": \"${DATA_DIR}\", \"protocol_observer\": ${PROTOCOL_OBSERVER} }"
exit 0

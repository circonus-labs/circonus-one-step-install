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

pg_scripts=""
read -r -d '' pg_scripts <<-2f17fc42839fca05a41430b091f087e2
pg_bgwriter.sh
pg_cache.sh
pg_connections.sh
pg_db_size.sh
pg_isready.sh
pg_locks.sh
pg_partitions.sh
pg_protocol_observer.sh
pg_repl_lag.sh
pg_repl_slots.sh
pg_replication.sh
pg_table_stats.sh
pg_transactions.sh
pg_vacuum.sh
2f17fc42839fca05a41430b091f087e2
enabled_scripts=()

# turn on all postgres stuff (create symlink if it doesn't already exist)
pushd $NAD_SCRIPTS_DIR >/dev/null
for script in $pg_scripts; do
    if [[ -x $PG_SCRIPTS_DIR/$script ]]; then
        [[ -h $script ]] || ln -s $script .
        enabled_scripts+=(${script%.*})
    fi
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

expected=${#enabled_scripts[@]}
found=0
for i in {0..10}; do
    found=0
    res=$(curl -sS localhost:2609/)
    for x in ${enabled_scripts[*]}; do
       	has=$(echo $res | grep -c $x)
       	if [[ $has -gt 0 ]]; then
       		((found++))
       	fi
    done
    if [[ $found -eq $expected ]]; then
       		break;
    fi
    sleep 3
done

if [[ $found -ne $expected ]]; then
    echo "{\"enabled\": false }"
    exit 1
fi

# if we have arrived here, the postgres plugin in NAD is installed and operating
echo "{\"enabled\": true, \"fs_mount\": \"${FS_NAME}\", \"data_dir\": \"${DATA_DIR}\", \"protocol_observer\": ${PROTOCOL_OBSERVER}, \"scripts\": \"${enabled_scripts[*]}\" }"
exit 0

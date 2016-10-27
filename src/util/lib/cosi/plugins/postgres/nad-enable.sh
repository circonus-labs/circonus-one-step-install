#!/usr/bin/env bash

# is this always true?
NAD_SCRIPTS_DIR=/opt/circonus/etc/node-agent.d
PG_SCRIPTS_DIR=$NAD_SCRIPTS_DIR/postgresql
PG_CONF=/opt/circonus/etc/pg-conf.sh

# determine if postgres is running
PGPID="$(pgrep -n -f postgres)"
[[ -n $PGPID ]] || {
    >&2 echo "Postgres server not detected, skipping setup"
    echo "{\"enabled\": false}"
    exit 1
}

# pull in the plugin settings
source $PG_CONF

# execute one of the scripts to ensure correct functionality
SIZE="$(${PG_SCRIPTS_DIR}/pg_db_size.sh | grep postgres)"
[[ $? -eq 0 && -n $SIZE ]] || {
    >&2 echo "Could not execute test script.  Please configure /opt/circonus/etc/pg-conf.sh appropriately and re-run"
    echo "{\"enabled\": false}"
    exit 1
}

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
    script_file="${PG_SCRIPTS_DIR}/${script}"
    if [[ -x $script_file ]]; then
        [[ -h $script ]] || ln -s $script_file .
        enabled_scripts+=(${script%.*})
    fi
done


# check for protocol observer (being installed)
PROTOCOL_OBSERVER="false"
po=/opt/circonus/bin/protocol_observer
if [[ ! -x $po ]]; then
    command -v protocol_observer >/dev/null 2>&1
    [[ $? -eq 0 ]] && PROTOCOL_OBSERVER="true"
else
    PROTOCOL_OBSERVER="true"
fi

# obtain the database directory and subsequent filesystem on which that directory resides
[[ -n {PGPASS:-} ]] && export PGPASSWORD=$PGPASS
DATA_DIR=$($PSQL_CMD -U $PGUSER -d $PGDATABASE -w -c "show data_directory;" -q -t)
if [[ $? -ne 0 ]]; then
    unset PGPASSWORD
    DATA_DIR=$($PSQL_CMD -U postgres -d $PGDATABASE -w -c "show data_directory;" -q -t)
    [[ $? -eq 0 ]] || DATA_DIR=$(sudo -u postgres $PSQL_CMD -d $PGDATABASE -w -c "show data_directory;" -q -t)
fi
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
    >&2 echo "Could not verify valid output from all enabled plugin scripts (${found} != ${expected})"
    echo "{\"enabled\": false }"
    exit 1
fi

# if we have arrived here, the postgres plugin in NAD is installed and operating
echo "{\"enabled\": true, \"fs_mount\": \"${FS_NAME}\", \"data_dir\": \"${DATA_DIR}\", \"protocol_observer\": ${PROTOCOL_OBSERVER}, \"scripts\": \"${enabled_scripts[*]}\" }"
exit 0

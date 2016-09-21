#!/usr/bin/env bash

# is this always true?
NAD_SCRIPTS_DIR=/opt/circonus/etc/node-agent.d
PG_SCRIPTS_DIR=$NAD_SCRIPTS_DIR/postgresql

# determine if postgres is running
PGPID=`pgrep postgres`
if [ -z "$PGPID" ]; then
    echo "Postgres not detected, skipping setup"
    exit 1;
fi

# turn on all postgres stuff
pushd $NAD_SCRIPTS_DIR >/dev/null
for i in $PG_SCRIPTS_DIR/*; do
    [[ -h $i ]] || ln -s $i .
done

# execute one of the scripts to ensure it's working
SIZE=`./pg_db_size.sh | grep postgres`
if [ -z "$SIZE" ]; then
    echo "Could not execute a test script.  Please configure /opt/circonus/etc/pg-conf.sh appropriately and re-run"
    for i in $PG_SCRIPTS_DIR/*; do
        rm `basename $i`
    done
    echo "{\"enabled\": false}"
    exit 1
fi

POPATH=`which protocol_observer`
PROTOCOL_OBSERVER="false"
if [ -n "$POPATH" ]; then
  PROTOCOL_OBSERVER="true"
fi

# pull in the plugin settings
source /opt/circonus/etc/pg-conf.sh
# note: we want this to fail of settings in pg-conf are bad
DATA_DIR=`psql -w -c "show data_directory;" -q -t`
DATA_DIR="$(echo -e "${DATA_DIR}" | tr -d '[[:space:]]')"
echo "{\"enabled\": true, \"data_dir\": \"${DATA_DIR}\", \"protocol_observer\": ${PROTOCOL_OBSERVER} }"

popd >/dev/null

# if we have arrived here, the postgres plugin in NAD is installed and operating
exit 0

#!/usr/bin/env bash

# is this always true?
NAD_SCRIPTS_DIR=/opt/circonus/etc/node-agent.d
PG_SCRIPTS_DIR=$NAD_SCRIPTS_DIR/postgresql

# turn off all postgres stuff
pushd $NAD_SCRIPTS_DIR >/dev/null
for i in $PG_SCRIPTS_DIR/*; do
    rm `basename $i`
done

popd >/dev/null

# kill postgres protocol_observer process if it is running
popid=$(pgrep -n -f 'protocol_observer -wire postgres')
if [[ -n "$popid" ]]; then
    kill -p $popid
fi

exit 0

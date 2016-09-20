#!/usr/bin/env bash

# is this always true?
NAD_SCRIPTS_DIR=/opt/circonus/etc/node-agent.d
CASS_SCRIPTS_DIR=$NAD_SCRIPTS_DIR/cassandra

# turn off all postgres stuff
pushd $NAD_SCRIPTS_DIR >/dev/null
for i in $CASS_SCRIPTS_DIR/*; do
    rm `basename $i`
done

popd >/dev/null

exit 0

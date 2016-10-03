#!/usr/bin/env bash

# is this always true?
NAD_SCRIPTS_DIR=/opt/circonus/etc/node-agent.d
CASS_SCRIPTS_DIR=$NAD_SCRIPTS_DIR/cassandra

# determine if cassandra is running
CASSREL=`nodetool version 2>/dev/null | grep ReleaseVersion`
if [ -z "$CASSREL" ]; then
    echo "Cassandra not detected, skipping setup"
    exit 1;
fi

CASSCLUSTER=$(nodetool describecluster 2>/dev/null | awk 'BEGIN{FS=":"}/Name:/{gsub(/^[ ]+/,"",$2);print $2}')

cass_scripts=""
read -r -d ' ' cass_scripts <<-f22a9a7b7066c7ed6486f71e6ac66e79
cassandra_cfstats.sh
cassandra_compaction.sh
cassandra_gcstats.sh
cassandra_info.sh
cassandra_protocol_observer.sh
f22a9a7b7066c7ed6486f71e6ac66e79
enabled_scripts=()

# turn on all cassandra stuff
pushd $NAD_SCRIPTS_DIR >/dev/null
for script in $cass_scripts; do
    if [[ -x $CASS_SCRIPTS_DIR/$script ]]; then
        [[ -h $script ]] || ln -s $CASS_SCRIPTS_DIR/$script
        enabled_scripts+=(${script%.*})
    fi
done

# execute one of the scripts to ensure it's working
SECS=`./cassandra_info.sh | grep uptime_secs`
if [ -z "$SECS" ]; then
    echo "Could not execute a test script.  Is nodetool and gawk in your path"
    for script in $cass_scripts; do
        [[ -h $script ]] && rm $script
    done
    echo "{\"enabled\": false}"
    exit 1
fi
popd > /dev/null

# default protocol_observer location
po=/opt/circonus/bin/protocol_observer
[[ -x $po ]] || po=`type -P protocol_observer`
PROTOCOL_OBSERVER="false"
if [ -n "$po" ]; then
  PROTOCOL_OBSERVER="true"
fi

# ensure nad is exposing plugin scripts
expected=${#enabled_scripts[@]}
found=0
for i in {0..10}; do
    res=$(curl -sS localhost:2609/)
    for x in ${enabled_scripts[*]}; do
        has=$(echo $res | grep -c $x)
        [[ $has -gt 0 ]] && ((found++))
    done
    [[ $found -eq $expected ]] && break
    sleep 3
done

if [[ $found -ne $expected ]]; then
    echo "{\"enabled\": false }"
    exit 1
fi

echo "{\"enabled\": true, \"protocol_observer\": ${PROTOCOL_OBSERVER}, \"cluster_name\": \"${CASSCLUSTER}\", \"scripts\": \"${enabled_scripts[*]}\" }"

# if we have arrived here, the cassandra plugin in NAD is installed and operating
exit 0

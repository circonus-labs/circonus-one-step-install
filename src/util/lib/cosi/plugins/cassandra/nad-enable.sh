#!/usr/bin/env bash

fail() {
    msg=${1:-Unknown error}
    echo "[ERROR] $msg"
    #[[ -t 1 ]] || >&2 echo $msg
    exit 1
}

echo "Enabling NAD Cassandra plugin scripts $(date)"

cfg_file=${NAD_PLUGIN_CONFIG_FILE:-/opt/circonus/cosi/etc/plugin-cassandra.json}
: ${NAD_SCRIPTS_DIR:=/opt/circonus/etc/node-agent.d}
CASS_SCRIPTS_DIR=$NAD_SCRIPTS_DIR/cassandra

[[ -d $NAD_SCRIPTS_DIR ]] || fail "NAD plugin directory ($NAD_SCRIPTS_DIR) not found."
[[ -d $CASS_SCRIPTS_DIR ]] || fail "Cassandra NAD plugin scripts directory ($CASS_SCRIPTS_DIR) not found."

# determine if cassandra is running
result=$(nodetool version)
echo "[DEBUG] version: $result"
[[ $(echo $result | grep -c ReleaseVersion) -gt 0 ]] || fail "requesting cassandra version ($result)"

result=$(nodetool describecluster)
echo "[DEBUG] cluster: $result"
[[ $? -eq 0 ]] || fail "requesting cluster info ($result)"
cluster_name=$(echo $result | grep 'Name:' | cut -d ':' -f 2)
[[ -n $cluster_name ]] || fail "cluster name not found in output ($result)"

echo "Cluster '$cluster_name'"

cass_scripts=""
read -r -d ' ' cass_scripts <<-f22a9a7b7066c7ed6486f71e6ac66e79
cassandra_cfstats.sh
cassandra_compaction.sh
cassandra_gcstats.sh
cassandra_info.sh
cassandra_po.sh
f22a9a7b7066c7ed6486f71e6ac66e79
enabled_scripts=()

# enable cassandra scripts
pushd $NAD_SCRIPTS_DIR >/dev/null
[[ $? -eq 0 ]] || fail "unable to change to $NAD_SCRIPTS_DIR"
for script in $cass_scripts; do
    printf "Enabling %s: " "${CASS_SCRIPTS_DIR}/${script}"
    if [[ -x $CASS_SCRIPTS_DIR/$script ]]; then
        if [[ -h $script ]]; then
            echo "already enabled"
        else
            ln -s $CASS_SCRIPTS_DIR/$script
            [[ $? -eq 0 ]] || fail "enabling ${CASS_SCRIPTS_DIR}/${script}"
            echo "enabled"
        fi
        enabled_scripts+=(${script%.*})
    fi
done
popd > /dev/null

# default protocol_observer location
po=/opt/circonus/bin/protocol_observer
[[ -x $po ]] || po=`type -P protocol_observer`
PROTOCOL_OBSERVER="false"
[[ -n "$po" && -x $po ]] && PROTOCOL_OBSERVER="true"

# give nad some time to initialize the scripts (because nodetool is *slow*)
echo -n "Waiting 30s for NAD to pick up new scripts"
for i in {1..30}; do
    echo -n '.'
    sleep 1
done
echo

# ensure nad is exposing plugin scripts
echo "Testing NAD for expected metrics"
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
    echo -n "Waiting 30s for NAD to pick up new scripts: "
    for i in {1..15}; do
        echo -n '.'
        sleep 1
    done
    echo
done

[[ $found -eq $expected ]] || fail "unable to verify, NAD not exposing expected metrics. ($found:$expected plugin modules)"

echo "Saving configuration $cfg_file"
cat << EOF > $cfg_file
{
    "enabled": true,
    "protocol_observer": $PROTOCOL_OBSERVER,
    "cluster_name": "$cluster_name",
    "scripts": "${enabled_scripts[*]}"
}
EOF

echo "Done enabling NAD Cassandra plugin scripts $(date)"

# if we have arrived here, the cassandra plugin in NAD is installed and operating
exit 0

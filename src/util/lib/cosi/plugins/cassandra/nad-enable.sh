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
: ${PLUGIN_SCRIPTS_DIR:=$NAD_SCRIPTS_DIR/cassandra}

[[ -d $NAD_SCRIPTS_DIR ]] || fail "NAD plugin directory ($NAD_SCRIPTS_DIR) not found"
[[ -d $PLUGIN_SCRIPTS_DIR ]] || fail "Cassandra NAD plugin scripts directory ($PLUGIN_SCRIPTS_DIR) not found"

# determine if cassandra is running
result=$(nodetool version)
[[ $(echo $result | grep -c ReleaseVersion) -gt 0 ]] || fail "requesting cassandra version ($result)"

result=$(nodetool describecluster | grep "Name:")
[[ $? -eq 0 ]] || fail "requesting cluster info ($result)"
cluster_name=$(echo $(echo $result | cut -d ':' -f 2))
[[ -n $cluster_name ]] || fail "cluster name not found in output ($result)"

echo "Cluster '$cluster_name'"

# explicit list of scripts to enable - there may be other files in
# the plugin directory which should *not* be treated as scripts
# (tools/utilities, config files, optional scripts, etc.)
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

PROTOCOL_OBSERVER="false"
# default protocol_observer location
po=/opt/circonus/bin/protocol_observer
[[ -x $po ]] || po=$(type -P protocol_observer)
[[ -n "$po" && -x $po ]] && PROTOCOL_OBSERVER="true"

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

echo "Saving configuration $cfg_file"
cat <<0e77cb32ce4169456e9325c2e61ea29a > $cfg_file
{
    "enabled": true,
    "protocol_observer": $PROTOCOL_OBSERVER,
    "cluster_name": "$cluster_name",
    "scripts": "${enabled_scripts[*]}"
}
0e77cb32ce4169456e9325c2e61ea29a

echo "Done enabling NAD Cassandra plugin scripts $(date)"
exit 0
# END

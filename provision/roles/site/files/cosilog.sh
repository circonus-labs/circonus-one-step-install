#!/usr/bin/env bash

node_path="/opt/node/bin"
[[ -d $node_path ]] || node_path="/opt/circonus/bin"
export PATH="$node_path:/opt/circonus/osi-site/node_modules/bunyan/bin:$PATH"

cosi_log="/opt/circonus/osi-site/log/cosi-site.log"
if [[ -f $cosi_log ]]; then
    tail -f $cosi_log | bunyan
else 
    journalctl -f -u cosi-site -o cat | bunyan
fi

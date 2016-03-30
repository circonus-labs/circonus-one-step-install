#!/usr/bin/env bash
export PATH="/opt/node/bin:/opt/circonus/osi-site/node_modules/bunyan/bin:$PATH"
journalctl -f -u cosi-site -o cat | bunyan

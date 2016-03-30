#!/usr/bin/env bash

#
# this is a barebones test (if the site starts with the default settings)
#
# 1. lint the source
# 2. start site with default settings (e.g. no config)
# 3. sleep for two seconds to let it spin up
# 4. kill the child process
#

set -e
set -u

if [[ ! -f cosi-site.js ]]; then
    if [[ -f ../cosi-site.js ]]; then
        cd ..
    else
        echo "Unable to find cosi-site.js in . or .."
    fi
fi

[[ -x test/test_lint.sh ]] && test/test_lint.sh

node_args="--trace-deprecation --trace-sync-io --throw-deprecation"

node $node_args cosi-site.js --log_dir="test" &
cs_pid=$!

sleep 2

kill $cs_pid

# remove the log if we've reached here without incident
# (considered to be a successful test, don't need to 
# keep appending to the test log)
set +e
[[ -f test/cosi-site.log ]] && rm test/cosi-site.log

#
# the basic source is 'commit'able
#

## END

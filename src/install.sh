#!/usr/bin/env bash

set -e
set -u

date

cosi_directory=${1:-/opt/circonus/osi-site}

local_path="/usr/gnu/bin:$PATH"

[[ -d /opt/circonus/bin ]] && local_path="/opt/circonus/bin:${local_path}"

export PATH=$local_path

node=$(type -P node)
[[ $? -eq 0 ]] || { echo "Unable to find node in $PATH"; exit 1; }

npm=$(type -P npm)
[[ $? -eq 0 ]] || { echo "Unable to find npm in $PATH"; exit 1; }

echo
echo "*** Installing COSI-Site node modules"

cd "$cosi_directory"

[[ -d .modules ]] && {
    echo "Cleaning up old module distribution"
    rm -rfv .modules
}
if [[ -d node_modules ]]; then
    echo "Existing node_modules"
    npm ls --depth=0
    echo "Updating existing modules"
    npm update --production
else
    npm install --production
fi
echo "Installed modules:"
npm ls --depth=0

# create the log directory if needed
[[ -d "${cosi_directory}/log" ]] || mkdir -p "${cosi_directory}/log"

echo
echo "Install completed, please report any problems to Circonus support."
echo "See README.md for details on customizing, starting, and stopping the COSI-Site service."
echo

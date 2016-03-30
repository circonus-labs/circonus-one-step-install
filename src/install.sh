#!/usr/bin/env bash

set -e
set -u

date

cosi_directory=${1:-/opt/circonus/osi-site}

local_path="$PATH"

[[ -d /opt/circonus/bin ]] && local_path="/opt/circonus/bin:${local_path}"

export PATH=$local_path

node=$(type -P node)
[[ $? -eq 0 ]] || { echo "Unable to find node in $PATH"; exit 1; }

npm=$(type -P npm)
[[ $? -eq 0 ]] || { echo "Unable to find npm in $PATH"; exit 1; }

echo
echo "*** Installing COSI-Site node modules"

cd "$cosi_directory"

omnios_tgz="cosi-node_modules-omnios.tar.gz"
if [[ -f $omnios_tgz ]]; then
    # install binary ones so dtrace support exists without having
    # to install all the dev packages on a production machine
    # ansible will gate copying of the tgz
    /usr/gnu/bin/tar -zxf $omnios_tgz
    [[ -d .modules ]] && rm -rf .modules
else
    install -d "${cosi_directory}/node_modules"
    for f in .modules/*.tgz; do tar -zxf "$f" -C node_modules/; done
    [[ $(uname -s) =~ Linux ]] && npm rebuild
fi

# create the log directory if needed
[[ -d "${cosi_directory}/log" ]] || mkdir -p "${cosi_directory}/log"

echo
echo "Install completed, please report any problems to Circonus support."
echo "See README.md for details on customizing, starting, and stopping the COSI-Site service."
echo

#!/usr/bin/env bash

# Copyright 2016 Circonus, Inc. All rights reserved.
# Use of this source code is governed by a BSD-style
# license that can be found in the LICENSE file.

## install nad in reverse mode

RED=$(tput setaf 1)
GREEN=$(tput setaf 2)
NORMAL=$(tput sgr0)
BOLD=$(tput bold)

log()  { printf "%b\n" "$*"; }
fail() { printf "${RED}" >&2; log "\nERROR: $*\n" >&2; printf "${NORMAL}" >&2; exit 1; }
pass() { printf "${GREEN}"; log "$*"; printf "${NORMAL}"; }

: ${cosi_dir:=}
: ${cosi_bin_dir:=}
: ${circonus_dir:=}
: ${nad_dir:=}

if [[ -z "${cosi_bin_dir:-}" ]]; then
    cosi_bin_dir="$(dirname `readlink -e ${BASH_SOURCE[0]}`)"
fi

if [[ -z "${cosi_dir:-}" ]]; then
    cosi_dir="$(readlink -e $cosi_bin_dir/..)"
fi

if [[ -z "${circonus_dir:-}" ]]; then
    circonus_dir="$(readlink -e $cosi_dir/..)"
fi

if [[ -d "${circonus_dir}/nad" ]]; then
    nad_ver=1
    nad_dir="$(readlink -e $circonus_dir/nad)"
elif [[ -s "${circonus_dir}/sbin/nad" ]]; then
    nad_ver=0
    nad_dir=$circonus_dir
fi

if [[ -z "${nad_dir}" ]]; then
    fail "Unable to find NAD installation"
fi

reverse_conf="${cosi_dir}/etc/circonus-nadreversesh"
log "Checking for NAD reverse config"
if [[ ! -f $reverse_conf ]]; then
    fail "NAD reverse configuration not found!"
fi
pass "Found ${reverse_conf}"

log "Loading NAD reverse conf"
source $reverse_conf

: ${nadrev_listen_address:=127.0.0.1:2609}
: ${nadrev_enable:=0}

if [[ $nadrev_enable -ne 1 ]]; then
    log "NAD reverse not enabled, exiting"
    exit 0
fi

install_conf=0
nad_conf=""

if [[ $nad_ver -eq 1 ]]; then
    nad_conf="${nad_dir}/etc/nad.conf"
    log "Checking for NAD config"
    if [[ ! -f $nad_conf ]]; then
        fail "NAD conf not found ${nad_conf}"
    fi

    if [[ $(grep -c "^NAD_OPTS" $nad_conf) -ne 0 ]]; then
    	sed -e 's#^NAD_OPTS#OLD_NAD_OPTS#' $nad_conf > $nad_conf.new
        install_conf=1
    fi

    if [[ $(grep -c "^NAD_LISTEN" $nad_conf) -eq 0 ]]; then
    	[[ -f $nad_conf.new ]] || { cp $nad_conf $nad_conf.new; echo -e "\n\n# ADDED BY COSI\n" >> $nad_conf.new; }
    	echo 'NAD_LISTEN="127.0.0.1:2609"' >> $nad_conf.new
        install_conf=1
    fi

    if [[ $(grep -c "^NAD_REVERSE" $nad_conf) -eq 0 ]]; then
        [[ -f $nad_conf.new ]] || { cp $nad_conf $nad_conf.new; echo -e "\n\n# ADDED BY COSI\n" >> $nad_conf.new; }
    	echo 'NAD_REVERSE="yes"' >> $nad_conf.new
        install_conf=1
    fi
elif [[ $nad_ver -eq 0 ]]; then
    : ${nadrev_plugin_dir:=/opt/circonus/etc/node-agent.d}
    : ${nadrev_check_id:=}
    : ${nadrev_key:=}
    : ${nadrev_apihost:=}
    : ${nadrev_apiport:=}
    : ${nadrev_apipath:=}
    : ${nadrev_apiprotocol:=}
    nadrev_opts="-c ${nadrev_plugin_dir} -p ${nadrev_listen_address}"
    [[ -n "${nadrev_check_id:-}" ]] || {
        fail "NAD reverse check id not set."
    }
    [[ -n "${nadrev_key:-}" ]] || {
        fail "NAD reverse key not set."
    }
    nadrev_opts+=" -r --cid ${nadrev_check_id} --authtoken ${nadrev_key}"
    [[ -z "${nadrev_apihost:-}" ]] || nadrev_opts+=" --apihost ${nadrev_apihost}"
    [[ -z "${nadrev_apiport:-}" ]] || nadrev_opts+=" --apiport ${nadrev_apiport}"
    [[ -z "${nadrev_apipath:-}" ]] || nadrev_opts+=" --apipath ${nadrev_apipath}"
    [[ -z "${nadrev_apiprotocol:-}" ]] || nadrev_opts+=" --apiprotocol ${nadrev_apiprotocol}"
    nad_conf="/etc/default/nad"
    if [[ ! -s $nad_conf ]]; then
        nad_conf="/etc/sysconfig/nad"
        if [[ ! -s $nad_conf ]]; then
            fail "Unable to find NAD config /etc/{default,sysconfig}/nad"
        fi
    fi
    echo "NAD_OPTS=\"${nadrev_opts}\"" > $nad_conf.new
    install_conf=1\
else
    fail "Unknown NAD version ($nad_ver)"
fi

if [[ $install_conf -eq 0 ]]; then
    pass "NAD conf already has reverse config, exiting"
    exit 0
fi

log "Updating NAD conf ${nad_conf}"

orig_conf_backup="${cosi_dir}/cache/nad.conf.orig"
[[ ! -f  $orig_conf_backup ]] && {
    cp $nad_conf $orig_conf_backup
    pass "saved copy of default NAD conf as ${orig_conf_backup}"
}

if [[ ! -f $nad_conf.new ]]; then
    fail "Updated NAD conf ${nad_conf}.new not found"
fi

mv -f $nad_conf.new $nad_conf
[[ $? -eq 0 ]] || fail "Unable to update ${nad_conf} with ${nad_conf}.new"

pass "Installed reverse config, restarting NAD"

if [[ -f /lib/systemd/system/nad.service ]]; then
    systemctl restart nad
    [[ $? -eq 0 ]] || {
        fail "Error restarting NAD, see log"
    }
elif [[ -f /etc/init/nad.conf ]]; then
    initctl restart nad
    [[ $? -eq 0 ]] || {
        fail "Error restarting NAD, see log"
    }
elif [[ -f /etc/init.d/nad ]]; then
    service nad restart
    [[ $? -eq 0 ]] || {
        fail "Error restarting NAD, see log"
    }
elif [[ -f /etc/rc.d/nad ]]; then
    service restart nad
    [[ $? -eq 0 ]] || {
        fail "Error restarting NAD, see log"
    }
elif [[ -f /var/svc/manifest/network/circonus/nad.xml ]]; then
    svcadm restart nad
    [[ $? -eq 0 ]] || {
        fail "Error restarting NAD, see log"
    }
else
    fail "Unknown system type '$(uname -s)', unable to determine how to restart NAD"
fi

log "Waiting for NAD to restart"
sleep 2

pass "NAD reverse configuration complete"
exit 0

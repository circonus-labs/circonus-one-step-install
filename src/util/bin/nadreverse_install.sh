#!/usr/bin/env bash

# Copyright 2016 Circonus, Inc. All rights reserved.
# Use of this source code is governed by a BSD-style
# license that can be found in the LICENSE file.

## install nad in reverse mode

: ${cosi_bin_dir:=}

if [[ -z "${cosi_bin_dir:-}" ]]; then
    cosi_bin_dir="$(dirname `readlink -e ${BASH_SOURCE[0]}`)"
fi

nadreverse_funcs="${cosi_bin_dir}/nadreverse_func.sh"
[[ -s $nadreverse_funcs ]] || { echo "Unable to find nadreverse functions ($nadreverse_funcs)"; exit 2; }
source $nadreverse_funcs

nad_conf_new=""
install_conf=0

function install_linux_nadv0 {
    local nadrev_opts=""

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
    nad_conf_new="${nad_conf}.new"
    echo "NAD_OPTS=\"${nadrev_opts}\"" > $nad_conf_new
    install_conf=1
}

function install_linux_nadv1 {
    nad_conf="${nad_dir}/etc/nad.conf"
    log "Checking for NAD config"
    if [[ ! -f $nad_conf ]]; then
        fail "NAD conf not found ${nad_conf}"
    fi

    nad_conf_new="${nad_conf}.new"

    # ensure any instance of old NAD_OPTS setting is disabled
    if [[ $(grep -c "^NAD_OPTS" $nad_conf) -ne 0 ]]; then
    	sed -e 's/^NAD_OPTS/#NAD_OPTS/' $nad_conf > $nad_conf_new
        install_conf=1
    fi

    # add listen address setting, if not set
    if [[ $(grep -c "^NAD_LISTEN" $nad_conf) -eq 0 ]]; then
    	[[ -f $nad_conf_new ]] || { cp $nad_conf $nad_conf_new; echo -e "\n\n# ADDED BY COSI\n" >> $nad_conf_new; }
    	echo 'NAD_LISTEN="127.0.0.1:2609"' >> $nad_conf_new
        install_conf=1
    fi

    # add reverse flag setting, if not set
    if [[ $(grep -c "^NAD_REVERSE" $nad_conf) -eq 0 ]]; then
        [[ -f $nad_conf_new ]] || { cp $nad_conf $nad_conf_new; echo -e "\n\n# ADDED BY COSI\n" >> $nad_conf_new; }
    	echo 'NAD_REVERSE="yes"' >> $nad_conf_new
        install_conf=1
    fi
}

function install_omnios {
    local nad_method_script="/var/svc/method/circonus-nad"

    [[ -f $nad_method_script ]] || fail "Unable to find NAD 'method' script in default location $nad_method_script"

    /usr/sbin/svcadm -v disable circonus/nad
    orig_conf_backup="${cosi_dir}/cache/nad.method.orig"
    [[ ! -f  $orig_conf_backup ]] && {
       cp $nad_method_script $orig_conf_backup
       pass "saved copy of default NAD config $orig_conf_backup"
    }
    cp "${cosi_dir}/service/circonus-nad-reverse.method" $nad_method_script
    pass "installed reverse config, restarting NAD"
    /usr/sbin/svcadm -v enable circonus/nad
    sleep 2
}

function install_linux {
    if [[ $nad_ver -eq 0 ]]; then
        install_linux_nadv0()
    elif [[ $nad_ver -eq 1 ]]; then
        install_linux_nadv1()
    else
        fail "Unknown NAD version ($nad_ver)"
    fi

    if [[ $install_conf -eq 0 ]]; then
        pass "NAD conf already has reverse config, exiting"
        exit 0
    fi

    log "Updating NAD conf ${nad_conf}"

    [[ ! -f  $orig_conf_backup ]] && {
        cp $nad_conf $orig_conf_backup
        pass "saved copy of default NAD conf as ${orig_conf_backup}"
    }

    if [[ ! -f $nad_conf_new ]]; then
        fail "Updated NAD conf ${nad_conf_new} not found"
    fi

    mv -f $nad_conf_new $nad_conf
    [[ $? -eq 0 ]] || fail "Unable to update ${nad_conf} with ${nad_conf_new}"

    pass "Installed reverse config, restarting NAD"
    restart_nad

    log "Waiting for NAD to restart"
    sleep 2
}

function install {
    if [[ -d /var/svc/manifest && -x /usr/sbin/svcadm ]]; then
        install_omnios
    else
        install_linux
    fi
}

install

pass "NAD reverse configuration complete"
exit 0

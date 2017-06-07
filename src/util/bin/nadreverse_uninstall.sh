#!/usr/bin/env bash

# Copyright 2016 Circonus, Inc. All rights reserved.
# Use of this source code is governed by a BSD-style
# license that can be found in the LICENSE file.

## install nad in reverse mode

: ${cosi_bin_dir:=}

if [[ -z "${cosi_bin_dir:-}" ]]; then
    cosi_bin_dir="$(dirname `readlink -f ${BASH_SOURCE[0]}`)"
fi

nadreverse_funcs="${cosi_bin_dir}/nadreverse_func.sh"
[[ -s $nadreverse_funcs ]] || { echo "Unable to find nadreverse functions ($nadreverse_funcs)"; exit 2; }
source $nadreverse_funcs

orig_conf_backup=""

function uninstall_linux {
    orig_conf_backup="${cosi_dir}/cache/nad.conf.orig"

    if [[ $nad_ver -eq 1 ]]; then
        nad_conf="/etc/default/nad"
        if [[ ! -s $nad_conf ]]; then
            nad_conf="/etc/sysconfig/nad"
            if [[ ! -s $nad_conf ]]; then
                fail "Unable to find NAD config /etc/{default,sysconfig}/nad"
            fi
        fi
    elif [[ $nad_ver -eq 2 ]]; then
        nad_conf="${nad_dir}/etc/nad.conf"
    else
        fail "Unknown NAD version ($nad_ver)"
    fi

    if [[ ! -f $nad_conf ]]; then
        fail "Unable to find running nad config ($nad_conf)"
    fi
}

function uninstall_omnios {
    orig_conf_backup="${cosi_dir}/cache/nad.method.orig"
    nad_conf="/var/svc/method/circonus-nad"
    if [[ ! -s $nad_conf ]]; then
        fail "Unable to find NAD 'method' script in default location $nad_conf"
    fi
}

function uninstall {
    if [[ -d /var/svc/manifest && -x /usr/sbin/svcadm ]]; then
        uninstall_omnios
    else
        uninstall_linux
    fi

    echo "Restoring NAD config from saved copy"

    if [[ ! -f $orig_conf_backup ]]; then
        fail "No original NAD 'config' backup found $orig_conf_backup"
    fi

    cp $orig_conf_backup $nad_conf
    if [[ $? -ne 0 ]]; then
        fail "Error copying original NAD config"
    fi
}

stop_nad

uninstall

pass "NAD reverse uninstalled"
exit 0

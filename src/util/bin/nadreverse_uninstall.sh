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
: ${nad_dir:=}

if [[ -z "${cosi_bin_dir:-}" ]]; then
    cosi_bin_dir="$(dirname `readlink -e ${BASH_SOURCE[0]}`)"
fi

if [[ -z "${cosi_dir:-}" ]]; then
    cosi_dir="$(readlink -e $cosi_bin_dir/..)"
fi

if [[ -z "${nad_dir:-}" ]]; then
    nad_dir="$(readlink -e $cosi_dir/..)"
fi

nad_conf="${nad_dir}/etc/nad.conf"

reverse_conf="$cosi_dir/etc/circonus-nadreversesh"
log "Checking for NAD reverse config"
if [[ ! -f $reverse_conf ]]; then
    pass "NAD reverse configuration not found! Skipping..."
    exit 0
fi
pass "Found $reverse_conf"

orig_conf_backup="${cosi_dir}/cache/nad.conf.orig"
if [[ ! -f  $orig_conf_backup ]]; then
    fail "No original NAD 'config' backup found $orig_conf_backup"
fi

pass "Found $orig_conf_backup"
echo "Stopping NAD service"
if [[ -f /lib/systemd/system/nad.service ]]; then
    systemctl stop nad
    [[ $? -eq 0 ]] || {
        fail "Error stopping NAD, see log"
    }
elif [[ -f /etc/init/nad.conf ]]; then
    initctl stop nad
    [[ $? -eq 0 ]] || {
        fail "Error stopping NAD, see log"
    }
elif [[ -f /etc/init.d/nad ]]; then
    service nad stop
    [[ $? -eq 0 ]] || {
        fail "Error stopping NAD, see log"
    }
elif [[ -f /etc/rc.d/nad ]]; then
    service stop nad
    [[ $? -eq 0 ]] || {
        fail "Error stopping NAD, see log"
    }
elif [[ -f /var/svc/manifest/network/circonus/nad.xml ]]; then
    svcadm disable nad
    [[ $? -eq 0 ]] || {
        fail "Error stopping NAD, see log"
    }
else
    fail "Unknown system type '$(uname -s)', unable to determine how to restart NAD"
fi

echo "Installing NAD config from saved copy"
cp $orig_conf_backup $nad_conf

pass "NAD reverse uninstalled"
exit 0

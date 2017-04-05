#!/usr/bin/env bash

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
NAD_OPTS=""
nad_conf="${nad_dir}/etc/nad.conf"
log "Checking for NAD config"
if [[ -f $nad_conf ]]; then
    pass "Found ${nad_conf}"
    log "Loading NAD conf"
    source $nad_conf
fi

if [[ ! $NAD_OPTS =~ /-p/ ]]; then
    NAD_OPTS+=" -p ${nadrev_listen_address}"
    install_conf=1
fi

if [[ ! $NAD_OPTS =~ /-r/ ]]; then
    NAD_OPTS+=" --reverse"
    install_conf=1
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

echo "NAD_OPTS=\"${NAD_OPTS}\"" > $nad_conf
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
    service restart nad
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

log "Waiting 5s for NAD to restart"
sleep 5

pass "NAD reverse configuration complete"
exit 0

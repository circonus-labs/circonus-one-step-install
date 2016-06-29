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

if [[ -z "${cosi_bin_dir:-}" ]]; then
    cosi_bin_dir="$(dirname `readlink -e ${BASH_SOURCE[0]}`)"
fi

if [[ -z "${cosi_dir:-}" ]]; then
    cosi_dir="$(readlink -e $cosi_bin_dir/..)"
fi

reverse_conf="$cosi_dir/etc/circonus-nadreversesh"
log "Checking for NAD reverse config"
if [[ ! -f $reverse_conf ]]; then
    fail "NAD reverse configuration not found!"
fi
pass "Found $reverse_conf"

log "Loading NAD reverse conf"
source $reverse_conf

: ${nadrev_plugin_dir:=/opt/circonus/etc/node-agent.d}
: ${nadrev_listen_address:=127.0.0.1:2609}
: ${nadrev_enable:=0}
: ${nadrev_check_id:=}
: ${nadrev_key:=}

[[ -d $nadrev_plugin_dir ]] || {
    fail "NAD plugin directory not found. ${nadrev_plugin_dir}"
}

nadrev_opts="-c ${nadrev_plugin_dir} -p ${nadrev_listen_address}"
if [[ $nadrev_enable -eq 1 ]]; then
    [[ -n "${nadrev_check_id:-}" ]] || {
        fail "NAD reverse check id not set."
    }
    [[ -n "${nadrev_key:-}" ]] || {
        fail "NAD reverse key not set."
    }
    nadrev_opts+=" -r --cid ${nadrev_check_id} --authtoken ${nadrev_key}"
fi

if [[ -f /etc/sysconfig/nad ]]; then
    # Linux (RHEL)
    if [[ -x /etc/init.d/nad ]]; then
        /etc/init.d/nad stop
    else
        service nad stop
    fi
    echo "NAD_OPTS=\"${nadrev_opts}\"" > /etc/sysconfig/nad
    # *should* work given that nad is installed as an /etc/init.d service
    # script regardless of actual init system in place on the host
    if [[ -x /etc/init.d/nad ]]; then
        /etc/init.d/nad start
    else
        service nad start
    fi
    sleep 2
elif [[ -f /etc/default/nad ]]; then
    # Linux (Ubuntu)
    if [[ -x /etc/init.d/nad ]]; then
        /etc/init.d/nad stop
    else
        service nad stop
    fi
    echo "NAD_OPTS=\"${nadrev_opts}\"" > /etc/default/nad
    # *should* work given that nad is installed as an /etc/init.d service
    # script regardless of actual init system in place on the host
    if [[ -x /etc/init.d/nad ]]; then
        /etc/init.d/nad start
    else
        service nad start
    fi
    sleep 2
elif [[ -d /var/svc/manifest && -x /usr/sbin/svcadm ]]; then
    # OmniOS
    nad_method_script="/var/svc/method/circonus-nad"
    if [[ -f $nad_method_script ]]; then
        /usr/sbin/svcadm -v disable circonus/nad
        cp "${cosi_dir}/service/circonus-nad-reverse.method" $nad_method_script
        /usr/sbin/svcadm -v enable circonus/nad
        sleep 2
    else
        fail "Unable to find NAD 'method' script in default location $nad_method_script"
    fi
else
    fail "Unknown system type '$(uname -s)', do not know how to configure NAD for reverse mode."
fi

exit 0

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
    pass "NAD reverse configuration not found! Skipping..."
    exit 0
fi
pass "Found $reverse_conf"

if [[ -f /etc/sysconfig/nad ]]; then
    # Linux (RHEL)
    orig_conf_backup="${cosi_dir}/cache/nad.conf.sysconfig.orig"
    if [[ -f  $orig_conf_backup ]]; then
        pass "Found $orig_conf_backup"
        echo "Stopping NAD service"
        service nad stop
        echo "Installing NAD config from saved copy"
        cp $orig_conf_backup /etc/sysconfig/nad
    else
        fail "No original NAD 'config' backup found $orig_conf_backup"
    fi
elif [[ -f /etc/default/nad ]]; then
    # Linux (Ubuntu)
    orig_conf_backup="${cosi_dir}/cache/nad.conf.default.orig"
    if [[ -f $orig_conf_backup ]]; then
        pass "Found $orig_conf_backup"
        echo "Stopping NAD service"
        service nad stop
        echo "Installing default NAD config from saved copy"
        cp $orig_conf_backup /etc/default/nad
    else
        fail "No original NAD 'config' backup found $orig_conf_backup"
    fi
elif [[ -d /var/svc/manifest && -x /usr/sbin/svcadm ]]; then
    # OmniOS
    nad_method_script="/var/svc/method/circonus-nad"
    if [[ -f $nad_method_script ]]; then
        orig_conf_backup="${cosi_dir}/cache/nad.method.orig"
        if [[ -f $orig_conf_backup ]]; then
            pass "Found $orig_conf_backup"
            echo "Stopping NAD service"
            /usr/sbin/svcadm -v disable circonus/nad
            echo "Installing default NAD 'method' scirpt from saved copy"
            cp $orig_conf_backup $nad_method_script
        else
            fail "No original NAD 'method' script backup found $orig_conf_backup"
        fi
    else
        fail "Unable to find NAD 'method' script in default location $nad_method_script"
    fi
else
    fail "Unknown system type '$(uname -s)', do not know how to configure NAD for reverse mode."
fi

exit 0

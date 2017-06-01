# Copyright 2016 Circonus, Inc. All rights reserved.
# Use of this source code is governed by a BSD-style
# license that can be found in the LICENSE file.

# common functions and variables for nadreverse install/uninstall

RED=$(tput setaf 1)
GREEN=$(tput setaf 2)
NORMAL=$(tput sgr0)
BOLD=$(tput bold)

log()  { printf "%b\n" "$*"; }
fail() { printf "${RED}" >&2; log "\nERROR: $*\n" >&2; printf "${NORMAL}" >&2; exit 1; }
pass() { printf "${GREEN}"; log "$*"; printf "${NORMAL}"; }

: ${cosi_dir:=}
: ${circonus_dir:=}
: ${nad_dir:=}

if [[ -z "${cosi_dir:-}" ]]; then
    cosi_dir="$(readlink -f $cosi_bin_dir/..)"
fi

if [[ -z "${circonus_dir:-}" ]]; then
    circonus_dir="$(readlink -f $cosi_dir/..)"
fi

if [[ -d "${circonus_dir}/nad" ]]; then
    nad_ver=2
    nad_dir="$(readlink -f $circonus_dir/nad)"
elif [[ -s "${circonus_dir}/sbin/nad" ]]; then
    nad_ver=1
    nad_dir=$circonus_dir
fi

if [[ -z "${nad_dir}" || ! -d $nad_dir ]]; then
    fail "Unable to find NAD installation"
fi
pass "Found NAD dir ${nad_dir}"

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

# nad config - will be different based on
# os and nad version.
nad_conf=""

# backup of original nad config
orig_conf_backup="${cosi_dir}/cache/nad.conf.orig"

# used by nadreverse_install
function restart_nad {
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
}

# used by nadreverse_uninstall
function stop_nad {
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
        # omnios svcadm doesn't have start/stop only enable/disable
        svcadm disable nad
        [[ $? -eq 0 ]] || {
            fail "Error stopping NAD, see log"
        }
    else
        fail "Unknown system type '$(uname -s)', unable to determine how to restart NAD"
    fi
}

function disable_nad {
    if [[ -f /lib/systemd/system/nad.service ]]; then
        systemctl stop nad
        [[ $? -eq 0 ]] || {
            fail "Error stopping NAD, see log"
        }
        systemctl disable nad
        [[ $? -eq 0 ]] || {
            fail "Error disabling NAD, see log"
        }
    elif [[ -f /etc/init/nad.conf ]]; then
        initctl stop nad
        [[ $? -eq 0 ]] || {
            fail "Error stopping NAD, see log"
        }
        rm /etc/init/nad.conf
        [[ $? -eq 0 ]] || {
            fail "Error disabling NAD, see log"
        }
    elif [[ -f /etc/init.d/nad ]]; then
        service nad stop
        [[ $? -eq 0 ]] || {
            fail "Error restarting NAD, see log"
        }
        chkconfig --del nad
        [[ $? -eq 0 ]] || {
            fail "Error disabling NAD, see log"
        }
        rm /etc/init.d/nad
        [[ $? -eq 0 ]] || {
            fail "Error disabling NAD, see log"
        }
    elif [[ -f /etc/rc.d/nad ]]; then
        service stop nad
        [[ $? -eq 0 ]] || {
            fail "Error stopping NAD, see log"
        }
        rm /etc/rc.d/nad
        [[ $? -eq 0 ]] || {
            fail "Error disabling NAD, see log"
        }
    elif [[ -f /var/svc/manifest/network/circonus/nad.xml ]]; then
        svcadm disable nad
        [[ $? -eq 0 ]] || {
            fail "Error restarting NAD, see log"
        }
    else
        fail "Unknown system type '$(uname -s)', unable to determine how to restart NAD"
    fi
}

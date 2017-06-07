#!/usr/bin/env bash

# Copyright 2016 Circonus, Inc. All rights reserved.
# Use of this source code is governed by a BSD-style
# license that can be found in the LICENSE file.

## install circonus-nadpush

RED=$(tput setaf 1)
GREEN=$(tput setaf 2)
NORMAL=$(tput sgr0)
BOLD=$(tput bold)

log()  { printf "%b\n" "$*"; }
fail() { printf "${RED}" >&2; log "\nERROR: $*\n" >&2; printf "${NORMAL}" >&2; exit 1; }
pass() { printf "${GREEN}"; log "$*"; printf "${NORMAL}"; }

service_name="circonus-nadpush"

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

: ${cosi_dir:=}
: ${cosi_bin_dir:=}
: ${circonus_dir:=}
: ${nad_dir:=}
: ${agent_ip:=127.0.0.1}
: ${agent_port:=2609}

nad_ver=0

if [[ -z "${cosi_bin_dir:-}" ]]; then
    cosi_bin_dir="$(dirname `readlink -e ${BASH_SOURCE[0]}`)"
fi

if [[ -z "${cosi_dir:-}" ]]; then
    cosi_dir="$(readlink -e $cosi_bin_dir/..)"
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

#
# NOTE: nadpush is still installed in circonus bin/etc
#       so there is one common set of service configs.
#
nadpush_bin="${circonus_dir}/bin/${service_name}"
nadpush_source="${cosi_bin_dir}/${service_name}"
nadpush_conf="${circonus_dir}/etc/${service_name}.json"
service_conf_dir="${cosi_dir}/service"

#
# check for nadpush_bin allows pre-copying a binary circonus-nadpush.
# don't force the node version (e.g. circonus-nadpush-go) but, default
# to it since it is included in the cosi utilities.
#
log "Checking for $nadpush_bin"
if [[ ! -x "$nadpush_bin" ]]; then
    log "Checking for $nadpush_source"
    if [[ -f "$nadpush_source" ]]; then
        log "Creating link $nadpush_bin -> $nadpush_source"
        chmod 750 "$nadpush_source"
        ln -s "$nadpush_source" "$nadpush_bin"
    else
        fail "Unable to find nadpush source/binary"
    fi
fi
pass "Found $nadpush_bin"

log "Checking for $nadpush_conf"
if [[ ! -f "$nadpush_conf" ]]; then
    fail "Unable to find nadpush configuration"
fi
pass "Found $nadpush_conf"


#
# check nad config for correct address:port settings
#
log "Checking for NAD configuration file"
if [[ $nad_ver -eq 1 ]]; then
    check_update_conf=1
    nad_conf="/etc/default/nad"
    if [[ ! -s $nad_conf ]]; then
        nad_conf="/etc/sysconfig/nad"
        if [[ ! -s $nad_conf ]]; then
            log "No NAD configuration file found /etc/{sysconfig,default}/nad, assuming $nadpush_conf has correct settings."
            check_update_conf=0
        fi
    fi
    if [[ $check_update_conf -eq 1 ]]; then
        log "Checking NAD options file for port setting"
        if [[ $(grep -c "${agent_ip}:${agent_port}" $nad_conf) -eq 0 ]]; then
            log "Adding -p ${agent_ip}:${agent_port} to NAD configuration"
            echo "NAD_OPTS=\"\${NAD_OPTS} -p ${agent_ip}:${agent_port}\"" >> $nad_conf
            log "Restaring NAD"
            restart_nad
        fi
        pass "NAD configured to listen to ${agent_ip}:${agent_port}"
    fi
elif [[ $nad_ver -eq 2 ]]; then
    nad_conf="${nad_dir}/etc/nad.conf"
    if [[ -s $nad_conf ]]; then
        source $nad_conf
        # add listen address setting, if not set
        if [[ "${NAD_LISTEN:-}" != "${agent_ip}:${agent_port}" ]]; then
            log "Adding NAD_LISTEN=\"${agent_ip}:${agent_port}\" to NAD configuration"
            echo "NAD_LISTEN=\"${agent_ip}:${agent_port}\"" >> $nad_conf
        fi
        log "Restaring NAD"
        restart_nad
    else
        log "No NAD configuration file found $nad_conf, assuming $nadpush_conf has correct settings."
    fi
else
    fail "Unknown NAD version (v${nad_ver})"
fi

#
# install service init config
#
log "Checking for init system in use"
if [[ -d /etc/systemd/system && -x /bin/systemctl ]]; then

    log "Found systemd, installing ${service_name} service"
    init_conf="${service_conf_dir}/${service_name}.service"
    [[ ! -f "$init_conf" ]] && fail "Unable to find ${service_name}.service unit file"

    log "Install ${service_name} unit file"
    cp "$init_conf" /etc/systemd/system/.

    log "Enable ${service_name} service"
    /bin/systemctl enable /etc/systemd/system/${service_name}.service

    log "Start ${service_name} service"
    /bin/systemctl start $service_name

elif [[ -d /var/svc/manifest && -x /usr/sbin/svccfg ]]; then

    log "Installing ${service_name} smf config"
    manifest_dir="/var/svc/manifest/application/circonus"

    [[ ! -d $manifest_dir ]] && mkdir -p $manifest_dir

    init_conf="${service_conf_dir}/${service_name}.smf"
    [[ ! -f "$init_conf" ]] && fail "Unable to find ${service_name}.smf file"

    svc_conf="${manifest_dir}/${service_name}.xml"
    cp $init_conf $svc_conf
    chown root:sys $svc_conf
    chmod 0644 $svc_conf

    log "Import ${service_name} service"
    /usr/sbin/svccfg -v import $svc_conf

elif [[ -d /etc/init.d && -x /sbin/chkconfig ]]; then

    # fallback "ye olde SysV init"
    log "Installing ${service_name} init script"
    init_conf="${service_conf_dir}/${service_name}.init"
    [[ ! -f "$init_conf" ]] && fail "Unable to find ${service_name}.init file"

    cp "$init_conf" /etc/init.d/${service_name}
    chmod 755 /etc/init.d/${service_name}
    /sbin/chkconfig --add $service_name

    # only relevant for init where the console log has to be redirected
    log_dir="/var/log/circonus"
    if [[ ! -d $log_dir ]]; then
        log "Create log directory ${log_dir}"
        set +e
        mkdir -p "$log_dir"
        [[ $? -eq 0 ]] || fail "Unable to create agent push log directory ${log_dir}"
        # change directory group to nobody and allow group to write, the majority of circonus daemons run as nobody
        log "Change group to nobody for $log_dir"
        chgrp nobody "$log_dir"
        [[ $? -eq 0 ]] || fail "Unable to update agent push log directory group=nobody ${log_dir}"
        log "Give group nobody write permissions for $log_dir"
        chmod g+w "$log_dir"
        [[ $? -eq 0 ]] || fail "Unable to update agent push log directory perm=g+w ${log_dir}"
        set -e
    fi

    log "Start ${service_name} service"
    /sbin/service $service_name start
else
    fail "Unknown system type '$(uname -s)', unable to determine init type to use."
fi

pass "${service_name} installed"

exit 0

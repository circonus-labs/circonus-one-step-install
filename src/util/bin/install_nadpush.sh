#!/usr/bin/env bash

## install circonus-nadpush

RED=$(tput setaf 1)
GREEN=$(tput setaf 2)
NORMAL=$(tput sgr0)
BOLD=$(tput bold)

log()  { printf "%b\n" "$*"; }
fail() { printf "${RED}" >&2; log "\nERROR: $*\n" >&2; printf "${NORMAL}" >&2; exit 1; }
pass() { printf "${GREEN}"; log "$*"; printf "${NORMAL}"; }

service_name="circonus-nadpush"

: ${cosi_dir:=}
: ${cosi_bin_dir:=}
: ${circonus_bin_dir:=/opt/circonus/bin}
: ${circonus_etc_dir:=/opt/circonus/etc}
: ${agent_ip:=127.0.0.1}
: ${agent_port:=2609}

if [[ -z "${cosi_bin_dir:-}" ]]; then
    cosi_bin_dir="$(dirname `readlink -e ${BASH_SOURCE[0]}`)"
fi

if [[ -z "${cosi_dir:-}" ]]; then
    cosi_dir="$(readlink -e $cosi_bin_dir/..)"
fi

nadpush_bin="${circonus_bin_dir}/${service_name}"
nadpush_source="${cosi_bin_dir}/${service_name}"
nadpush_conf="${circonus_etc_dir}/${service_name}.json"
service_conf_dir="${cosi_dir}/service"

# allows pre-copying a binary circonus-nadpush. don't force the
# node version (e.g. circonus-nadpush-go) but, default to it
# since it is included in the cosi utilities.
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

log "Checking for NAD configuration file"
nad_opts_file=""
if [[ -f /etc/sysconfig/nad ]]; then
    nad_opts_file="/etc/sysconfig/nad"
    pass "Found $nad_opts_file"
elif [[ -f /etc/default/nad ]]; then
    nad_opts_file="/etc/default/nad"
    pass "Found $nad_opts_file"
else
    nad_opts_file=""
    warn "No NAD configuration file found, assuming $nadpush_conf has correct settings."
fi

if [[ -n "${nad_opts_file:-}" ]]; then
    log "Checking NAD options file for port setting"
    if [[ $(grep -c "${agent_ip}:${agent_port}" $nad_opts_file) -eq 0 ]]; then
        log "Adding -p ${agent_ip}:${agent_port} to NAD configuration"
        echo "NAD_OPTS=\"\${NAD_OPTS} -p ${agent_ip}:${agent_port}\"" >> $nad_opts_file
        log "Restaring NAD"
        service nad restart
    fi
    pass "NAD configured to listen to ${agent_ip}:${agent_port}"
fi

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

elif [[ -d /etc/init && -x /sbin/initctl ]]; then

    log "Found upstart, installing ${service_name} upstart configuration"
    init_conf="${service_conf_dir}/${service_name}.upstart"
    [[ ! -f "$init_conf" ]] && fail "Unable to find ${service_name}.upstart file"

    log "Install ${service_name} upstart file"
    cp "$init_conf" "/etc/init/${service_name}.conf"

    # initctl check-config ${service_name}
    # initctl reload-configuration
    log "Start ${service_name} service"
    /sbin/initctl start ${service_name}

else

    # fallback "ye olde SysV init"
    log "Installing ${service_name} init script"
    init_conf="${service_conf_dir}/${service_name}.init"
    [[ ! -f "$init_conf" ]] && fail "Unable to find ${service_name}.init file"

    cp "$init_conf" /etc/init.d/${service_name}
    chmod 755 /etc/init.d/${service_name}
    /sbin/chkconfig --add $service_name

    # only relevant for init where the console log has to be redirected
    log_dir="/var/log/circonus"
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

    log "Start ${service_name} service"
    /sbin/service $service_name start
fi

pass "${service_name} installed"

exit 0

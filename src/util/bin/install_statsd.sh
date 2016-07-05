#!/usr/bin/env bash

## install circonus-statsd

RED=$(tput setaf 1)
GREEN=$(tput setaf 2)
NORMAL=$(tput sgr0)
BOLD=$(tput bold)

log()  { printf "%b\n" "$*"; }
fail() { printf "${RED}" >&2; log "\nERROR: $*\n" >&2; printf "${NORMAL}" >&2; exit 1; }
pass() { printf "${GREEN}"; log "$*"; printf "${NORMAL}"; }

service_name="circonus-statsd"

: ${cosi_dir:=}
: ${cosi_bin_dir:=}

if [[ -z "${cosi_bin_dir:-}" ]]; then
    cosi_bin_dir="$(dirname `readlink -e ${BASH_SOURCE[0]}`)"
fi

if [[ -z "${cosi_dir:-}" ]]; then
    cosi_dir="$(readlink -e $cosi_bin_dir/..)"
fi

statsd_disabled="${cosi_dir}/etc/statsd.disabled"
if [[ -f "$statsd_disabled" ]]; then
    log "StatsD disabled, skipping."
    exit 0
fi

log "Checking for ${service_name} package"
statsd_pkg="${cosi_dir}/cosi-statsd.tar.gz"
if [[ ! -f "$statsd_pkg" ]]; then
    fail "${service_name} package not found, unable to install. (${statsd_pkg})"
fi
pass "${service_name} package found."

log "Checking for ${service_name} configuration"
statsd_cfg="${cosi_dir}/etc/statsd.json"
if [[ ! -f "$statsd_cfg" ]]; then
    statsd_disabled="${cosi_dir}/etc/statsd.disabled"
    if [[ ! -f "$statsd_disabled" ]]; then
        fail "${service_name} configuration not found, unable to install. (${statsd_cfg})"
    else
        pass "StatsD disabled, exiting."
        exit 0
    fi
fi
pass "${service_name} configuration found."

# TODO add port udp:127.0.0.1:8125 check
# TODO add port udp:127.0.0.1:8126 check

log "Installing ${service_name} into ${cosi_dir}/statsd"
cd "$cosi_dir"
tar -zxf "$statsd_pkg"
pass "${service_name} installed."


log "Checking for init system in use"
service_conf_dir="${cosi_dir}/service"

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

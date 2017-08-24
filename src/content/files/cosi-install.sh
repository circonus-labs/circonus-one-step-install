#!/usr/bin/env bash

#
# Optional configuration file
#
cosi_config_file="/etc/default/cosi"

set -o errtrace
set -o errexit
set -o nounset

#
# internal functions
#
usage() {
  printf "%b" "Circonus One Step Install Help

Usage

  ${GREEN}cosi-install --key <apikey> --app <apiapp> [options]${NORMAL}

Options

  --key           Circonus API key/token **${BOLD}REQUIRED${NORMAL}**

  --app           Circonus API app name (authorized w/key) Default: cosi

  [--cosiurl]     COSI URL Default: https://onestep.circonus.com/

  [--apiurl]      Circonus API URL Default: https://api.circonus.com/

  [--agent]       Agent mode. Default: reverse
                  reverse = Install NAD, NAD will open connection to broker.
                            broker will request metrics through reverse connection.
                  revonly = reverse *ONLY* ensure target will not resolve by prefixing
                            with 'REV:'
                  pull = Install NAD, broker will connect to system and request metrics
                  push = Install NAD, metrics will be sent to broker at an interval
                  Note: If NAD is already installed, installation will be skipped

  [--regconf]     Configuration file with custom options to use during registration.

  [--target]      Host IP/hostname to use as check target.

  [--group]       Unique identifier to use when creating/finding the group check. (e.g. 'webservers')

  [--broker]      Broker to use (numeric portion of broker CID e.g. cid=/broker/123, pass 123 as argument).

  [--broker-type] Type of broker to use, (any|enterprise) default: any
                  any - try enterprise brokers, if none available, try public brokers, if none available fail
                  enterprise - only use enterprise brokers, fail if none available

  [--noreg]       Do not attempt to register this system. Using this option
                  will *${BOLD}require${NORMAL}* that the system be manually registered.
                  Default: register system (creating check, graphs, and worksheet)

  [--help]        This message

  [--trace]       Enable tracing, output debugging messages
"
}

##
## logging and messaging
##

# ignore tput errors for terms that do not
# support colors (colors will be blank strings)
set +e
RED=$(tput setaf 1)
GREEN=$(tput setaf 2)
NORMAL=$(tput sgr0)
BOLD=$(tput bold)
set -e

log()  { [[ "$cosi_quiet_flag" == 1 ]] && log_only "$*" || printf "%b\n" "$*" | tee -a $cosi_install_log; }
log_only() { printf "%b\n" "${FUNCNAME[1]:-}: $*" >> $cosi_install_log; }
fail() { printf "${RED}" >&2; log "\nERROR: $*\n" >&2; printf "${NORMAL}" >&2; exit 1; }
pass() { printf "${GREEN}"; log "$*"; printf "${NORMAL}"; }

##
## utility functions
##

__parse_parameters() {
    local token=""
    log "Parsing command line parameters"
    while (( $# > 0 )) ; do
        token="$1"
        shift
        case "$token" in
        (--key)
            if [[ -n "${1:-}" ]]; then
                cosi_api_key="$1"
                shift
            else
                fail "--key must be followed by an api key."
            fi
            ;;
        (--app)
            if [[ -n "${1:-}" ]]; then
                cosi_api_app="$1"
                shift
            else
                fail "--app must be followed by an api app."
            fi
            ;;
        (--cosiurl)
            if [[ -n "${1:-}" ]]; then
                cosi_url="$1"
                shift
            else
                fail "--cosiurl must be followed by a URL."
            fi
            ;;
        (--apiurl)
            if [[ -n "${1:-}" ]]; then
                cosi_api_url="$1"
                shift
            else
                fail "--apiurl must be followed by a URL."
            fi
            ;;
        (--agent)
            if [[ -n "${1:-}" ]]; then
                cosi_agent_mode="$1"
                shift
                if [[ ! "${cosi_agent_mode:-}" =~ ^(reverse|revonly|pull|push)$ ]]; then
                    fail "--agent must be followed by a valid agent mode (reverse|revonly|pull|push)."
                fi
            else
                fail "--agent must be followed by an agent mode (reverse|revonly|pull|push)."
            fi
            ;;
        (--regconf)
            if [[ -n "${1:-}" ]]; then
                cosi_regopts_conf="$1"
                shift
            else
                fail "--regconf must be followed by a filespec."
            fi
            ;;
        (--group)
            if [[ -n "${1:-}" ]]; then
                cosi_group_id="$1"
                shift
            else
                fail "--group must be followed by an ID string"
            fi
            ;;
        (--target)
            if [[ -n "${1:-}" ]]; then
                cosi_host_target="$1"
                shift
            else
                fail "--target must be followed by an IP or hostname."
            fi
            ;;
        (--broker)
            if [[ -n "${1:-}" ]]; then
                cosi_broker_id="$1"
                shift
            else
                fail "--broker must be followed by Broker Group ID."
            fi
            ;;
        (--broker-type)
            if [[ -n "${1:-}" ]]; then
                cosi_broker_type="$1"
                shift
                if [[ ! "${cosi_broker_type:-}" =~ ^(any|enterprise)$ ]]; then
                    fail "--broker-type must be followed by type (any|enterprise)."
                fi
            else
                fail "--broker-type must be followed by type (any|enterprise)."
            fi
            ;;
        (--noreg)
            cosi_register_flag=0
            ;;
        (--save)
            cosi_save_config_flag=1
            ;;
        (--trace)
            set -o xtrace
            cosi_trace_flag=1
            ;;
        (--help)
            usage
            exit 0
            ;;
        (*)
            printf "\n${RED}Unknown command line option '${token}'.${NORMAL}\n"
            usage
            exit 1
            ;;
        esac
    done
}

__detect_os() {
    local lsb_conf="/etc/lsb-release"
    local release_file=""

    # grab necessary bits of information needed for
    # cosi api to determine if it knows of a agent
    # package to support this system (distro/vers/arch).

    uname -a >> $cosi_install_log

    cosi_os_type="$(uname -s)"
    cosi_os_dist=""
    cosi_os_vers="$(uname -r)"
    cosi_os_arch="$(uname -p)"
    # try 'arch' if 'uname -p' emits 'unknown' (looking at you debian...)
    [[ "$cosi_os_arch" == "unknown" ]] && cosi_os_arch=$(arch)

    set +e
    dmi=$(type -P dmidecode)
    if [[ $? -eq 0 ]]; then
        result=$($dmi -s bios-version 2>/dev/null | tr "\n" " ")
        [[ $? -eq 0 ]] && cosi_os_dmi=$result
    fi
    set -e

    #
    # preference lsb if it is available
    #
    if [[ -f "$lsb_conf" ]]; then
        log "\tLSB found, using '${lsb_conf}' for OS detection."
        cat $lsb_conf >> $cosi_install_log
        source $lsb_conf
        cosi_os_dist="${DISTRIB_ID:-}"
        cosi_os_vers="${DISTRIB_RELEASE:-}"
    fi

    if [[ -z "$cosi_os_dist" ]]; then
        cosi_os_dist="unknown"
        # attempt detection the hard way, thre are way to many methods
        # to "detect" this information and none of them are ubiquitous...
        case "${cosi_os_type}" in
        (Linux)
            if [[ -f /etc/redhat-release ]] ; then
                log "\tAttempt RedHat(variant) detection"
                release_rpm=$(/bin/rpm -qf /etc/redhat-release)
                IFS='-' read -a distro_info <<< "$release_rpm"
                [[ ${#distro_info[@]} -ge 4 ]] || fail "Unable to derive distribution and version from $release_rpm, does not match known pattern."
                case ${distro_info[0]} in
                (centos)
                    # centos-release-5-4.el5.centos.1 - CentOS 5.4
                    # centos-release-6-7.el6.centos.12.3.x86_64 - CentOS 6.7
                    # centos-release-7-2.1511.el7.centos.2.10.x86_64 - CentOS 7.2.1511
                    cosi_os_dist="CentOS"
                    cosi_os_vers="${distro_info[2]}.${distro_info[3]%%\.el*}"
                    ;;
                (redhat)
                    # redhat-release-server-6Server-6.5.0.1.el6.x86_64 - RedHat 6.5.0.1
                    # redhat-release-server-7.2-9.el7.x86_64 - RedHat 7.2
                    cosi_os_dist="RedHat"
                    cosi_os_vers=$(echo $release_rpm | sed -r 's/^.*-([0-9\.]+)(\.el6|-[0-9]).*$/\1/')
                    #[[ ${#distro_info[@]} -ge 5 ]] && cosi_os_vers="${distro_info[4]%%\.el*}"
                    ;;
                (fedora)
                    # fedora-release-23-1.noarch - Fedora 23.1
                    cosi_os_dist="Fedora"
                    cosi_os_vers="${distro_info[2]}.${distro_info[3]%%\.*}"
                    ;;
                (oraclelinux)
                    # oraclelinux-release-7.2-1.0.5.el7.x86_64 - Oracle 7.2
                    cosi_os_dist="Oracle"
                    cosi_os_vers="${distro_info[2]}"
                    ;;
                (*) fail "Unknown RHEL variant '${distro_info[0]}' derived from '${release_rpm}'" ;;
                esac
                log "\tDerived ${cosi_os_dist} v${cosi_os_vers} from '${release_rpm}'"
            elif [[ -f /etc/debian_version ]] ; then
                log "\tAttempt Debian(variant) detection"
                # /etc/debian_version is not consistent enough to be reliable
                # as anything other than a signal. use /etc/os-release or forfeit
                if [[ -f /etc/os-release ]] ; then
                    log_only "\t\tUsing os-release"
                    cat /etc/os-release >> $cosi_install_log
                    source /etc/os-release
                    cosi_os_dist="${ID:-Unsupported}"
                    cosi_os_vers="${VERSION_ID:-}"
                else
                    log_only "\t\tUsing debian_version"
                    cosi_os_dist="Debian"
                    cosi_os_vers="$(head -1 /etc/debian_version)"
                fi
            elif [[ -f /etc/os-release ]]; then
                log "\tAttempt detection from /etc/os-release"
                cat /etc/os-release >> $cosi_install_log
                source /etc/os-release
                if [[ "${PRETTY_NAME:-}" != "" ]]; then
                    log "\t\tFound '${PRETTY_NAME}'"
                fi
                cosi_os_dist="${ID:-Unsupported}"
                cosi_os_vers="${VERSION_ID:-}"
                # if it's an amazon linux ami stuff dmi so it will trigger
                # getting the external public name (amazon linux doesn't
                # include the dmidecode command by default).
                if [[ "${cosi_os_dist:-}" == "amzn" ]]; then
                    if [[ "${cosi_os_dmi:-}" == "" ]]; then
                        cosi_os_dmi="amazon"
                    fi
                fi
            else
                ### add more as needed/supported
                cosi_os_dist="unsup"
            fi
            ;;
        (Darwin)
            cosi_os_dist="OSX"
            ;;
        (FreeBSD|BSD)
            log "\tAttempt ${cosi_os_type} detection"
            if [[ -x /bin/freebsd-version ]]; then
                cosi_os_type="BSD"
                cosi_os_dist="FreeBSD"
                cosi_os_vers=$(/bin/freebsd-version | cut -d '-' -f 1)
            fi
            ;;
        (AIX)
            cosi_os_dist="AIX"
            ;;
        (SunOS|Solaris)
            log "\tAttempt ${cosi_os_type}(variant) detection"
            cosi_os_dist="Solaris"
            cosi_os_arch=$(isainfo -n)
            if [[ -f /etc/release ]]; then
                # dist/version/release signature hopefully on first line...KISSerate
                release_info=$(echo $(head -1 /etc/release))
                log "\tFound /etc/release - using '${release_info}'"
                read -a distro_info <<< "$release_info"
                [[ ${#distro_info[@]} -eq 3 ]] || fail "Unable to derive distribution and version from $release_info, does not match known pattern."
                cosi_os_dist="${distro_info[0]}"
                case "$cosi_os_dist" in
                (OmniOS)
                    cosi_os_vers="${distro_info[2]}"
                    ;;
                (*)
                    cosi_os_vers="${distro_info[1]}.${distro_info[2]}"
                    ;;
                esac
            fi
            ;;
        (*)
            cosi_os_arch="${HOSTTYPE:-}"
            ;;
        esac
    fi
}


__lookup_os() {
    local request_url
    local request_result
    local curl_result
    local cmd_result

    log "\tLooking up $cosi_os_type $cosi_os_dist v$cosi_os_vers $cosi_os_arch."

    #
    # set the global cosi url arguments
    #
    cosi_url_args="?type=${cosi_os_type}&dist=${cosi_os_dist}&vers=${cosi_os_vers}&arch=${cosi_os_arch}"

    request_url="${cosi_url}package${cosi_url_args}"
    log_only "\tCOSI package request: $request_url"

    #
    # manually handle errors for curl
    #
    set +o errexit

    curl_result=$(\curl -m 15 -H 'Accept: text/plain' -sS -w '|%{http_code}' "$request_url" 2>&1)
    cmd_result=$?

    set -o errexit

    log_only "\tResult: \"${curl_result}\" ec=${cmd_result}"

    if [[ $cmd_result -ne 0 ]]; then
        fail "curl command encountered an error (exit code=${cmd_result}) - ${curl_result}\n\tTry curl -v '${request_url}' to see full transaction details."
    fi

    IFS='|' read -a request_result <<< "$curl_result"
    if [[ ${#request_result[@]} -ne 2 ]]; then
        fail "Unexpected response received from COSI request '${curl_result}'. Try curl -v '${request_url}' to see full transaction details."
    fi

    case ${request_result[1]} in
    (200)
        pass "\t$cosi_os_dist $cosi_os_vers $cosi_os_arch supported!"
        IFS='|' read -a cosi_agent_package_info <<< "${request_result[0]//%%/|}"
        ;;
    (000)
        # outlier but, made it happen by trying to get curl to timeout
        # pointed cosi_url at a port being listened to and the daemon responded...doh!
        # (good to know i suppose, that if curl gets a non-http response '000' is the result code)
        fail "Unknown/invalid http result code: ${request_result[1]}\nmessage: ${request_result[0]}"
        ;;
    (*)
        # unsupported distribution|version|architecture
        fail "API result - http result code: ${request_result[1]}\nmessage: ${request_result[0]}"
        ;;
    esac
}


__download_package() {
    local curl_err=""
    local package_url=""
    local package_file=""
    local local_package_file=""

    package_url=${cosi_agent_package_info[0]}
    package_file=${cosi_agent_package_info[1]}

    if [[ "${package_url: -1}" != "/" ]]; then
        package_url+="/"
    fi
    package_url+=$package_file

    #
    # do what we can to validate agent package url
    #
    if [[ -n "${package_url:-}" ]]; then
        [[ "$package_url" =~ ^http[s]?://[^/]+/.*\.(rpm|deb|tar\.gz)$ ]] || fail "COSI agent package url does not match URL pattern (^http[s]?://[^/]+/.*\.(rpm|deb)$)"
    else
        fail "Invalid COSI agent package url"
    fi

    log "Downloading Agent package ${package_url}"

    local_package_file="${cosi_cache_dir}/${package_file}"

    if [[ -f "${local_package_file}" ]] ; then
        pass "\tFound existing ${local_package_file}, using it for the installation."
    else
        set +o errexit
        \curl -m 120 -f "${package_url}" -o "${local_package_file}"
        curl_err=$?
        set -o errexit
        [[ "$curl_err" == "0" && -f "${local_package_file}" ]] || fail "Unable to download '${package_url}' (curl exit code=${curl_err})."
    fi
}

__install_agent() {
    local pub_cmd=""
    local pkg_cmd="${package_install_cmd:-}"
    local pkg_cmd_args="${package_install_args:-}"
    local do_install=""
    local package_file

    if [[ ${cosi_os_type,,} =~ linux ]]; then
        if [[ ${#cosi_agent_package_info[@]} -ne 2 ]]; then
            fail "Invalid Agent package information ${cosi_agent_package_info[@]}, expected 'url file_name'"
        fi
        __download_package
        package_file="${cosi_cache_dir}/${cosi_agent_package_info[1]}"
        log "Installing agent package ${package_file}"
        [[ ! -f "$package_file" ]] && fail "Unable to find package '$package_file'"
        if [[ -z "${pkg_cmd:-}" ]]; then
            if [[ $package_file =~ \.rpm$ ]]; then
                pkg_cmd="yum"
                pkg_cmd_args="localinstall -y ${package_file}"
            elif [[ $package_file =~ \.deb$ ]]; then
                pkg_cmd="dpkg"
                pkg_cmd_args="--install --force-confold ${package_file}"
            else
                fail "Unable to determine package installation command on '${cosi_os_dist}' for '${package_file}'. Please set package_install_cmd in config file to continue."
            fi
        fi
    else
        case "$cosi_os_dist" in
        (OmniOS)
            if [[ ${#cosi_agent_package_info[@]} -ne 3 ]]; then
                fail "Invalid Agent package information ${cosi_agent_package_info[@]}, expected 'publisher_url publisher_name package_name'"
            fi
            set +e
            pkg publisher ${cosi_agent_package_info[1]} &>/dev/null
            if [[ $? -ne 0 ]]; then
                pub_cmd="pkg set-publisher -g ${cosi_agent_package_info[0]} ${cosi_agent_package_info[1]}"
            fi
            set -e
            pkg_cmd="pkg"
            pkg_cmd_args="install ${cosi_agent_package_info[2]}"
            ;;
        (FreeBSD|BSD)
            if [[ ${#cosi_agent_package_info[@]} -ne 2 ]]; then
                fail "Invalid Agent package information ${cosi_agent_package_info[@]}, expected 'url file_name'"
            fi
            __download_package
            package_file="${cosi_cache_dir}/${cosi_agent_package_info[1]}"
            log "Installing agent package ${package_file}"
            [[ ! -f "$package_file" ]] && fail "Unable to find package '$package_file'"
            pkg_cmd="tar"
            pkg_cmd_args="-zxf ${package_file} -C /"
            ;;
        (*)
            fail "Unable to determine package installation command for ${cosi_os_dist}. Please set package_install_cmd in config file to continue."
            ;;
        esac
    fi

    type -P $pkg_cmd >> $cosi_install_log 2>&1 || fail "Unable to find '${pkg_cmd}' command. Ensure it is in the PATH before continuing."

    # callout hook placeholder (PRE)
    if [[ -n "${agent_pre_hook:-}" && -x "${agent_pre_hook}" ]]; then
        log "Agent PRE hook found, running..."
        set +e
        "${agent_pre_hook}"
        set -e
    fi

    if [[ "${pub_cmd:-}" != "" ]]; then
        $pub_cmd 2>&1 | tee -a $cosi_install_log
        [[ ${PIPESTATUS[0]} -eq 0 ]] || fail "adding publisher '${pub_cmd}'"
    fi

    $pkg_cmd $pkg_cmd_args 2>&1 | tee -a $cosi_install_log
    [[ ${PIPESTATUS[0]} -eq 0 ]] || fail "installing ${package_file} '${pkg_cmd} ${pkg_cmd_args}'"

    # reset the agent directory after nad has been installed
    # for the first time.
    [[ -d "${base_dir}/nad" ]] && agent_dir="${base_dir}/nad"
    [[ -d "${base_dir}/etc" ]] || mkdir -p "${base_dir}/etc"

    # callout hook placeholder (POST)
    if [[ -n "${agent_post_hook:-}" && -x "${agent_post_hook}" ]]; then
        log "Agent POST hook found, running..."
        set +e
        "${agent_post_hook}"
        set -e
    fi

    # give agent a couple seconds to start/restart
    sleep 2
}

__is_nad_installed() {
    local agent_bin="${agent_dir}/sbin/nad"
    if [[ -x "$agent_bin" ]]; then
        pass "NAD installation found"
        set +e
        if [[ -x /usr/bin/dpkg-query ]]; then
            log_only "\t$(/usr/bin/dpkg-query --show nad-omnibus 2>&1)"
            nad_pkg_ver=$(/usr/bin/dpkg-query --showformat='${Version}' --show nad-omnibus)
            [[ $? -ne 0 ]] && nad_pkg_ver=""
        elif [[ -x /usr/bin/rpm ]]; then
            log_only "\t$(/usr/bin/rpm -qi nad-omnibus 2>&1)"
            nad_pkg_ver=$(/usr/bin/rpm --queryformat '%{Version}' -q nad-omnibus 2>/dev/null)
            [[ $? -ne 0 ]] && nad_pkg_ver=""
        elif [[ -x /usr/bin/pkg ]]; then
            log_only "\t$(/usr/bin/pkg info field/nad 2>&1)"
        else
            log_only "\tNAD found but do not know how to get info for this OS."
        fi
        set -e
        agent_state=1
    fi
}

__is_nad_running() {
    local pid
    local ret
    if [[ $agent_state -eq 1 ]]; then
        set +e
        pid=$(pgrep -n -f "sbin/nad")
        ret=$?
        set -e
        if [[ $ret -eq 0 && ${pid:-0} -gt 0 ]]; then
            pass "NAD process running PID:${pid}"
            agent_state=2
        fi
    fi
}

__check_nad_url() {
    local url="${agent_url:-http://127.0.0.1:2609/}inventory"
    local err
    local ret

    if [[ $agent_state -eq 2 ]]; then
        set +e
        err=$(\curl --noproxy localhost,127.0.0.1 -sSf "$url" -o /dev/null 2>&1)
        ret=$?
        set -e
        if [[ $ret -ne 0 ]]; then
            fail "Agent installed and running but not reachable\nCurl exit code: ${ret}\nCurl err msg: ${err}"
        fi
        pass "NAD URL reachable"
        agent_state=3
    fi
}

__check_agent() {
    if [[ $agent_state -eq 0 ]]; then
        __is_nad_installed  #state 1
    fi
    if [[ $agent_state -eq 1 ]]; then
        __is_nad_running    #state 2
    fi
    if [[ $agent_state -eq 2 ]]; then
        __check_nad_url     #state 3
    fi
}

__start_agent() {
    local agent_pid
    local ret

    log "Starting agent (if not already running)"

    if [[ ${agent_state:-0} -eq 1 ]]; then
        if [[ -s /lib/systemd/system/nad.service ]]; then
            systemctl start nad
        elif [[ -s /etc/init/nad.conf ]]; then
            initctl start nad
        elif [[ -s /etc/init.d/nad ]]; then
            /etc/init.d/nad start
        elif [[ -s /var/svc/manifest/network/circonus/nad.xml ]]; then
            svcadm enable nad
        elif [[ -s /etc/rc.d/nad ]]; then
            if [[ -s /etc/rc.conf ]]; then
                # treat as FreeBSD
                # enable it if there is no nad_enable setting
                [[ $(grep -cE '^nad_enable' /etc/rc.conf) -eq 0 ]] && echo 'nad_enable="YES"' >> /etc/rc.conf
                # start it if it is enabled
                [[ $(grep -c 'nad_enable="YES"' /etc/rc.conf) -eq 1 ]] && service nad start
            fi
        else
            fail "Agent installed, unable to determine how to start it (unrecognized init system)."
        fi
        if [[ $? -ne 0 ]]; then
            fail "COSI was unable to start NAD - try running NAD manually, check for errors specific to this system."
        fi
        sleep 5
    fi

    set +e
    agent_pid=$(pgrep -n -f "sbin/nad")
    ret=$?
    set -e

    if [[ ${ret:-0} -eq 0 && ${agent_pid:-0} -gt 0 ]]; then
        pass "Agent running with PID ${agent_pid}"
    else
        fail "Unable to locate running agent, pgrep exited with exit code ${ret}"
    fi
}


__save_cosi_register_config() {
    #
    # saves the cosi-install configuraiton options for cosi-register
    #
    log "Saving COSI registration configuration ${cosi_register_config}"
    cat <<EOF > "$cosi_register_config"
{
    "api_key": "${cosi_api_key}",
    "api_app": "${cosi_api_app}",
    "api_url": "${cosi_api_url}",
    "cosi_url": "${cosi_url}",
    "agent_mode": "${cosi_agent_mode}",
    "agent_url": "${agent_url}",
    "custom_options_file": "${cosi_regopts_conf}",
    "cosi_host_target": "${cosi_host_target}",
    "cosi_broker_id": "${cosi_broker_id}",
    "cosi_broker_type": "${cosi_broker_type}",
    "cosi_os_dist": "${cosi_os_dist}",
    "cosi_os_vers": "${cosi_os_vers}",
    "cosi_os_arch": "${cosi_os_arch}",
    "cosi_os_type": "${cosi_os_type}",
    "cosi_os_dmi": "${cosi_os_dmi}",
    "cosi_group_id": "${cosi_group_id}"
}
EOF
    [[ $? -eq 0 ]] || fail "Unable to save COSI registration configuration '${cosi_register_config}'"
    [[ -f ${cosi_register_id_file} ]] || echo $cosi_id > ${cosi_register_id_file}
}


__fetch_cosi_utils() {
    local cosi_register_url="${cosi_url}utils"
    local cosi_utils_file="${cosi_cache_dir}/cosi-util.tz"
    local curl_err
    local node_bin

    log "Retrieving COSI utilities ${cosi_register_url}"
    log_only "\tReg utils URL: $cosi_register_url"
    log_only "\tReg utils: $cosi_utils_file"

    set +o errexit
    \curl -m 15 -f "${cosi_register_url}" -o "${cosi_utils_file}"
    curl_err=$?
    set -o errexit
    [[ $curl_err -eq 0 && -f "$cosi_utils_file" ]] || {
        [[ -f "$cosi_utils_file" ]] && rm "$cosi_utils_file"
        fail "Unable to fetch '${cosi_register_url}' (curl exit code=${curl_err})."
    }

    cd "$cosi_dir"
    # clean previous node_modules if it exists
    [[ -d node_modules ]] && rm -rf node_modules
    log "Unpacking COSI utilities into $(pwd)"
    tar -oxzf "$cosi_utils_file"
    [[ $? -eq 0 ]] || fail "Unable to unpack COSI utiltities"

    log "Verifying node version..." # oh FFS!
    node_bin=""     # omnibus packages              omnios packages
    for f in /opt/circonus/embedded/bin/node /opt/circonus/bin/node; do
        if [[ -x $f ]]; then
            node_bin=$f
            break
        fi
    done
    if [[ "${node_bin:-}" == "" ]]; then
        fail "Unable to find the NAD embedded NodeJS binary in the two locations of which this script is aware..."
    fi
    # check node version, must be 'v4.*' or 'v6.*'
    node_ver=$($node_bin -v)
    if [[ ! $node_ver =~ ^v(4|6) ]]; then
        fail "NodeJS ${node_ver} is out-of-date, please update NAD and/or NodeJS package providing ${node_bin}."
    fi

    log "Fixing cosi util shebangs..."

    for f in $(ls -1 /opt/circonus/cosi/bin/{cosi,circonus}*); do
        sed -e "s#%%NODE_BIN%%#$node_bin#" $f > $f.tmp
        mv $f.tmp $f
        chmod 755 $f
    done

}


#
# main support functions
#

cosi_initialize() {
    local settings_list

    #
    # precedence order:
    #   load config (if exists)
    #   backfill with defaults
    #   override with command line (vars/flags)
    #

    log "Initializing cosi-install"

    if [[ "$*" == *--trace* ]] || (( ${cosi_trace_flag:-0} > 0 )) ; then
      set -o xtrace
      cosi_trace_flag=1
    fi

    BASH_MIN_VERSION="3.2.25"
    if [[ -n "${BASH_VERSION:-}" &&
          "$(printf "%b" "${BASH_VERSION:-}\n${BASH_MIN_VERSION}\n" | LC_ALL=C sort -t"." -k1,1n -k2,2n -k3,3n | head -n1)" != "${BASH_MIN_VERSION}" ]]; then
        fail "BASH ${BASH_MIN_VERSION} required (you have $BASH_VERSION)"
    fi

    export PS4="+ \${FUNCNAME[0]:+\${FUNCNAME[0]}()}  \${LINENO} > "

    #
    # enable use of a config file for automated deployment support
    #
    if [[ -f "$cosi_config_file" ]] ; then
        log_only "Loading config file ${cosi_config_file}"
        source "$cosi_config_file"
    fi

    #
    # internal variables (after sourcing config file, prevent unintentional overrides)
    #
    base_dir="/opt/circonus"
    agent_dir="${base_dir}"
    [[ -d "${base_dir}/nad" ]] && agent_dir="${base_dir}/nad"

    bin_dir="${base_dir}/bin"
    etc_dir="${cosi_dir}/etc"
    reg_dir="${cosi_dir}/registration"

    agent_state=0
    agent_ip="127.0.0.1"
    agent_port="2609"
    agent_type="nad"
    agent_url="http://${agent_ip}:${agent_port}/"
    agent_pre_hook="${cosi_dir}/agent_pre_hook.sh"
    agent_post_hook="${cosi_dir}/agent_post_hook.sh"
    cosi_agent_package_info=()
    cosi_cache_dir="${cosi_dir}/cache"
    cosi_register_config="${etc_dir}/cosi.json"
    cosi_register_id_file="${etc_dir}/.cosi_id"
    cosi_url_args=""
    cosi_util_dir="${cosi_dir}/util"
    cosi_os_arch=""
    cosi_os_dist=""
    cosi_os_type=""
    cosi_os_vers=""
    cosi_os_dmi=""
    cosi_id=""
    cosi_group_id=""

    #
    # set defaults (if config file not used or options left unset)
    #
    : ${cosi_trace_flag:=0}
    : ${cosi_quiet_flag:=0}
    : ${cosi_register_flag:=1}
    : ${cosi_regopts_conf:=}
    : ${cosi_host_target:=}
    : ${cosi_broker_id:=}
    : ${cosi_broker_type:=any}
    : ${cosi_save_config_flag:=0}
    : ${cosi_url:=https://onestep.circonus.com/}
    : ${cosi_api_url:=https://api.circonus.com/}
    : ${cosi_api_key:=}
    : ${cosi_api_app:=cosi}
    : ${cosi_agent_mode:=reverse}
    : ${cosi_install_agent:=1}
    : ${package_install_cmd:=}
    : ${package_install_args:=--install}

    # list of settings we will save if cosi_save_config_flag is ON
    settings_list=" \
    cosi_api_key \
    cosi_api_app \
    cosi_api_url \
    cosi_url \
    cosi_agent_mode \
    cosi_host_target \
    cosi_broker_id \
    cosi_broker_type \
    cosi_install_agent \
    cosi_register_flag \
    cosi_register_config \
    cosi_quiet_flag \
    package_install_cmd \
    package_install_args \
    cosi_group_id
    "

    #
    # manually handle errors for these
    #
    set +o errexit

    # let environment VARs override config/default for api key/app
    [[ -n "${COSI_KEY:-}" ]] && cosi_api_key="$COSI_KEY"
    [[ -n "${COSI_APP:-}" ]] && cosi_api_app="$COSI_APP"

    #
    # trigger error if needed commands are not found...
    local cmd_list="awk cat chgrp chmod curl grep head ln mkdir pgrep sed tar tee uname"
    local cmd
    log_only "Verifying required commands exist. '${cmd_list}'"
    for cmd in $cmd_list; do
        type -P $cmd >> $cosi_install_log 2>&1 || fail "Unable to find '${cmd}' command. Ensure it is available in PATH '${PATH}' before continuing."
    done

    set -o errexit

    #
    # parameters override defaults and config file settings (if it was used)
    #
    __parse_parameters "$@"

    #
    # verify *required* values API key and app
    #
    [[ -n "${cosi_api_key:-}" ]] || fail "API key is *required*. (see '${0} -h' for more information.)"
    [[ -n "${cosi_api_app:-}" ]] || fail "API app is *required*. (see '${0} -h' for more information.)"

    #
    # fixup URLs, ensure they end with '/'
    #
    [[ "${cosi_api_url: -1}" == "/" ]] || cosi_api_url+="/"
    [[ "${cosi_url: -1}" == "/" ]] || cosi_url+="/"
    [[ "${agent_url: -1}" == "/" ]] || agent_url+="/"

    type -P uuidgen > /dev/null 2>&1 && cosi_id=$(uuidgen)

    if [[ -z "${cosi_id:-}" ]]; then
        kern_uuid=/proc/sys/kernel/random/uuid
        if [[ -f $kern_uuid ]]; then
            cosi_id=$(cat $kern_uuid)
        else
            cosi_id=$(python  -c 'import uuid; print uuid.uuid1()')
        fi
    fi

    #
    # optionally, save the cosi-install config
    # (can be used on other systems and/or during testing)
    #
    if [[ "${cosi_save_config_flag:-0}" == "1" ]] ; then
        log "Saving config file ${cosi_config_file}"
        > "$cosi_config_file"
        for cosi_setting in $settings_list; do
            echo "${cosi_setting}=\"${!cosi_setting}\"" >> "$cosi_config_file"
        done
    fi

    [[ -d "$cosi_cache_dir" ]] || {
        mkdir -p "$cosi_cache_dir"
        [[ $? -eq 0 ]] || fail "Unable to create cache_dir '${cosi_cache_dir}'."
    }
    [[ -d "$reg_dir" ]] || {
        mkdir -p "$reg_dir"
        [[ $? -eq 0 ]] || fail "Unable to create reg_dir '${reg_dir}'."
    }
    [[ -d "$etc_dir" ]] || {
        mkdir -p "$etc_dir"
        [[ $? -eq 0 ]] || fail "Unable to create etc_dir '${etc_dir}'."
    }
    [[ -d "$bin_dir" ]] || {
        mkdir -p "$bin_dir"
        [[ $? -eq 0 ]] || fail "Unable to create bin_dir '${bin_dir}'."
    }

}


cosi_verify_os() {
    log "Verifying COSI support for OS"
    __detect_os
    __lookup_os
}


cosi_check_agent() {
    log "Checking Agent state"
    __check_agent

    if [[ $agent_state -eq 0 ]]; then
        log "Agent not found, installing Agent"
        __install_agent
        __check_agent
    fi

    if [[ $agent_state -eq 1 ]]; then
        __start_agent
        __check_agent
    fi

    if [[ $agent_state -eq 3 ]]; then
        pass "Agent running and responding"
    fi
}


cosi_register() {
    local cosi_script="${cosi_dir}/bin/cosi"
    local cosi_register_cmd="register"
    local cosi_register_opt=""
    local install_nadpush="${cosi_dir}/bin/install_nadpush.sh"
    local install_nadreverse="${cosi_dir}/bin/nadreverse_install.sh"

    echo
    __fetch_cosi_utils
    echo
    __save_cosi_register_config
    echo

    if [[ "${cosi_register_flag:-1}" != "1" ]]; then
        log "Not running COSI registration script, --noreg requested"
        return
    fi

    [[ -x "$cosi_script" ]] || fail "Unable to find cosi command '${cosi_script}'"

    echo
    log "### Running COSI registration ###"
    echo
    log_only "running: $cosi_script" "$cosi_register_cmd"
    "$cosi_script" "$cosi_register_cmd" | tee -a $cosi_install_log
    [[ ${PIPESTATUS[0]} -eq 0 ]] || fail "Errors encountered during registration."


    if [[ "${cosi_agent_mode:-}" == "push" ]]; then
        echo
        log "### Enabling push mode for agent ###"
        echo
        if [[ -x "$install_nadpush" ]]; then
            $install_nadpush | tee -a $cosi_install_log
            [[ ${PIPESTATUS[0]} -eq 0 ]] || fail "Errors encountered during nadpush installation."
        else
            fail "Agent mode is push, nadpush installer not found."
        fi
    elif [[ "${cosi_agent_mode}" == "reverse" || "${cosi_agent_mode}" == "revonly" ]]; then
        echo
        log "### Enabling ${cosi_agent_mode} mode for agent ###"
        echo
        if [[ -x "$install_nadreverse" ]]; then
            if [[ -x /bin/freebsd-version ]]; then
                $install_nadreverse
                [[ $? -eq 0 ]] || fail "Errors encountered during NAD ${cosi_agent_mode} configuration."
            else
                $install_nadreverse | tee -a $cosi_install_log
                [[ ${PIPESTATUS[0]} -eq 0 ]] || fail "Errors encountered during NAD ${cosi_agent_mode} configuration."
            fi
        else
            fail "Agent mode is ${cosi_agent_mode}, nadreverse installer not found."
        fi
    fi

    echo
    log "### Creating rulesets, if any ruleset configurations were pre-installed. ###"
    echo
    log "running: '${cosi_dir}/bin/cosi rulesets create'"
    "${cosi_dir}/bin/cosi" rulesets create

    echo
    log "### Registration Overview ###"
    echo
    pass "--- Graphs created ---"
    log "running: '${cosi_dir}/bin/cosi graph list --long'"
    "${cosi_dir}/bin/cosi" graph list --long

    echo
    pass "--- Check created ---"
    log "running: '${cosi_dir}/bin/cosi check list --long --verify'"
    "${cosi_dir}/bin/cosi" check list --long --verify

    echo
    pass "--- Worksheet created ---"
    log "running: '${cosi_dir}/bin/cosi worksheet list --long'"
    "${cosi_dir}/bin/cosi" worksheet list --long

    echo
    pass "--- Dashboard created ---"
    log "running: '${cosi_dir}/bin/cosi dashboard list --long'"
    "${cosi_dir}/bin/cosi" dashboard list --long

    echo
    echo "To see any of these lists again in the future run, ${cosi_dir}/bin/cosi (graph|check|worksheet|dashboard) list --long"
    echo
}


cosi_install() {
    cosi_initialize "$@"
    cosi_verify_os
    cosi_check_agent
    cosi_register
}

####
################### main
####

#
# short-circuit a request for help
#
if [[ "$*" == *--help* ]]; then
    usage
    exit 0
fi

#
# no arguments are passed and no conf file
#
if [[ $# -eq 0 && ! -f "$cosi_config_file" ]]; then
    usage
    exit 0
fi


#
# NOTE Ensure sufficient rights to do the install
#
(( UID != 0 )) && {
    printf "\n%b\n\n" "${RED}Must run as root[sudo] -- installing software requires certain permissions.${NORMAL}"
    exit 1
}

#
# NOTE All COSI assets and logs are saved in the cosi_dir
#
: ${cosi_dir:=/opt/circonus/cosi}
[[ -d "$cosi_dir" ]] || {
    set +e
    mkdir -p "$cosi_dir"
    [[ $? -eq 0 ]] || {
        printf "\n%b\n" "${RED}Unable to create cosi_dir '${cosi_dir}'.${NORMAL}"
        exit 1
    }
    set -e
}
cosi_log_dir="${cosi_dir}/log"
[[ -d "$cosi_log_dir" ]] || {
    set +e
    mkdir -p "$cosi_log_dir"
    [[ $? -eq 0 ]] || {
        printf "\n%b\n" "${RED}Unable to create cosi_log_dir '${cosi_log_dir}'.${NORMAL}"
        exit 1
    }
    set -e
}
cosi_install_log="${cosi_log_dir}/install.log"

#
# squelch output (log messages to file only)
#
: ${cosi_quiet_flag:=0}
if [[ "$*" == *--quiet* ]]; then
  cosi_quiet_flag=1
fi

[[ ! -f $cosi_install_log ]] || printf "\n\n==========\n\n" >> $cosi_install_log
log "Started Circonus One step Install on $(date)"
printf "Options: $*\n" >> $cosi_install_log

cosi_install "$@"

log "Completed Circonus One step Install on $(date)\n"

## END
# vim:ts=4:sw=4:et

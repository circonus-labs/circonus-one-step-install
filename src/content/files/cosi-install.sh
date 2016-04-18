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

  --key         Circonus API key/token **${BOLD}REQUIRED${NORMAL}**

  --app         Circonus API app name (authorized w/key) Default: cosi

  [--cosiurl]   COSI URL Default: https://onestep.circonus.com/

  [--apiurl]    Circonus API URL Default: https://api.circonus.com/

  [--agent]     Agent mode (pull|push) Default: pull
                pull = Install NAD, broker will connect to system and request metrics
                push = Install NAD, metrics will be sent to broker at an interval
                Note: If NAD is already installed, installation will be skipped

  [--regconf]   Configuration file with custom options to use during registration.

  [--noreg]     Do not attempt to register this system. Using this option
                will *${BOLD}require${NORMAL}* that the system be manually registered.
                Default: register system (creating check, graphs, and worksheet)

  [--help]      This message

  [--trace]     Enable tracing, output debugging messages
"
}

##
## logging and messaging
##

RED=$(tput setaf 1)
GREEN=$(tput setaf 2)
NORMAL=$(tput sgr0)
BOLD=$(tput bold)

log()  { [[ "$cosi_quiet_flag" == 1 ]] && log_only "$*" || printf "%b\n" "$*" | tee -a $cosi_install_log; }
log_only() { printf "%b\n" "${FUNCNAME[1]}: $*" >> $cosi_install_log; }
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
                    if [[ ! "${cosi_agent_mode:-}" =~ ^(pull|push)$ ]]; then
                        fail "--agent must be followed by a valid agent mode (pull|push)."
                    fi
                else
                    fail "--agent must be followed by an agent mode (pull|push)."
                fi
                ;;
            (--statsd)
                cosi_statsd_flag=1
                cosi_statsd_type="host"
                ;;
            (--regconf)
                if [[ -n "${1:-}" ]]; then
                    cosi_regopts_conf="$1"
                    shift
                else
                    fail "--regconf must be followed by a filespec."
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
                    if [[ -f /etc/centos-release ]] ; then
                        cosi_os_dist='CentOS'
                        release_file="/etc/centos-release"
                    elif [[ -f /etc/fedora-release ]] ; then
                        cosi_os_dist='Fedora'
                        release_file="/etc/fedora-release"
                    else
                        cosi_os_dist='RedHat'
                        release_file="/etc/redhat-release"
                    fi
                    log_only "\t\tIdentified ${cosi_os_dist}"
                    if [[ -n "${release_file:-}"  && -f "$release_file" ]]; then
                        log_only "\t\tUsing ${release_file} for version"
                        cosi_os_vers=$(cat $release_file | tee -a $cosi_install_log | sed s/.*release\ // | sed s/\ .*//)
                    fi
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
                else
                    ### add more as needed/supported
                    cosi_os_dist="unsup"
                fi
                ;;
            (Darwin)
                cosi_os_dist="OSX"
                ;;
            (FreeBSD|BSD)
                cosi_os_dist="BSD"
                ;;
            (AIX)
                cosi_os_dist="AIX"
                ;;
            (SunOS|Solaris)
                cosi_os_dist="Solaris"
                ;;
            (*)
                cosi_os_arch="${HOSTTYPE:-}"
                ;;
        esac
    fi
}


__parse_request_result() {
    local old_ifs="$IFS"
    if [[ -z "$1" ]]; then
        fail "No curl result from COSI request to parse!"
    fi
    IFS='|'
    cosi_package_info=(${1:-})
    IFS="$old_ifs"
}


__lookup_os() {
    local request_url
    local request_result

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

    # -m --max-time
    # -s --silent
    # -S --show-error
    # -w --write-out
    # -H --header
    request_result=$(\curl -m 15 -H 'Accept: text/plain' -sS -w '|%{http_code}' "$request_url" 2>&1)
    request_result+="|$?"

    set -o errexit

    log_only "\tResult: \"${request_result}\""

    # *MUST* quote cosi_request_result below, strangeness happens with parsing if it isn't
    __parse_request_result "$request_result"

    if [[ "${#cosi_package_info[@]}" != "3" ]]; then
        fail "Invalid result received from COSI request. Try curl -v '${request_result}' to see full transaction details."
    fi

    # cosi_package_info[0] is the package url or error messsage
    # cosi_package_info[1] is the http response code (e.g. 200)
    # cosi_package_info[2] is the exit code from curl command
    if [[ "${cosi_package_info[2]}" != "0" ]]; then
        fail "curl command encountered an error (exit code=${cosi_package_info[2]}) - ${cosi_package_info[0]}\n\tTry curl -v '${request_url}' to see full transaction details."
    fi

    if [[ "${cosi_package_info[1]}" == "200" ]]; then
        pass "\t$cosi_os_dist $cosi_os_vers $cosi_os_arch supported!"
        cosi_agent_package_url="${cosi_package_info[0]}"
    elif [[ "${cosi_package_info[1]}" == "000" ]]; then
        # outlier but, made it happen by trying to get curl to timeout
        # pointed cosi_url at a port being listened to and the daemon responded...doh!
        # (good to know i suppose, that if curl gets a non-http response '000' is the result code)
        fail "Unknown/invalid http result code: ${cosi_package_info[1]}\nmessage: ${cosi_package_info[0]}"
    else
        # unsupported distribution|version|architecture
        fail "API result - ${cosi_package_info[1]}: ${cosi_package_info[0]}"
    fi
}


__download_package() {
    local curl_err=""
    local package_url=${cosi_agent_package_url:-}
    local package_name=""

    #
    # do what we can to validate agent package url
    #
    if [[ -n "${cosi_agent_package_url:-}" ]]; then
        [[ "$cosi_agent_package_url" =~ ^http[s]?://[^/]+/.*\.(rpm|deb)$ ]] || fail "COSI agent package url does not match URL pattern (^http[s]?://[^/]+/.*\.(rpm|deb)$)"
    else
        fail "Invalid COSI agent package url"
    fi

    package_name=$(echo "$package_url" | awk -F"/" '{ print $NF }')

    log "Downloading Agent package ${package_url}"

    package_file="${cosi_cache_dir}/${package_name}"

    if [[ -f "${package_file}" ]] ; then
        pass "\tFound existing ${package_file}, using it for the installation."
    else
        set +o errexit
        \curl -m 120 -f "${package_url}" -o "${package_file}"
        curl_err=$?
        set -o errexit
        [[ "$curl_err" == "0" && -f "${package_file}" ]] || fail "Unable to download '${package_url}' (curl exit code=${curl_err})."
    fi
}

__install_agent() {
    local pkg_cmd="${package_install_cmd:-}"
    local pkg_cmd_args="${package_install_args:-}"
    local do_install=""

    __download_package

    log "Installing agent package ${package_file}"

    [[ ! -f "$package_file" ]] && fail "Unable to find package '$package_file'"

    if [[ -z "${pkg_cmd:-}" ]]; then
        case "$cosi_os_dist" in
            (Ubuntu)
                pkg_cmd="dpkg"
                pkg_cmd_args="--install"
                ;;
            (CentOS|RedHat)
                pkg_cmd="rpm"
                pkg_cmd_args="-v --install"
                ;;
            (*)
                fail "Unable to determine package installation command for ${cosi_os_dist}. Please set package_install_cmd in config file to continue."
                ;;
        esac
    fi

    type -P $pkg_cmd >> $cosi_install_log 2>&1 || fail "Unable to find '${pkg_cmd}' command. Ensure it is in the PATH before continuing."

    if [[ "${cosi_confirm_flag:-1}" == "1" ]]; then
        while true ; do
            printf "\n%b\n" "Agent installation will use the following command:\n\n\t${pkg_cmd} ${pkg_cmd_args} \"${package_file}\"\n"
            read -p "Confirm executing this command now? (yes|no) " do_install < /dev/tty
            case $do_install in
                ([Yy]*)
                    break
                    ;;
                ([Nn]*)
                    printf "%b\n" "${RED}"
                    log "Exiting, installation aborted by user -- package *NOT* installed."
                    printf "%b\n" "${NORMAL}"
                    exit 1
                    ;;
                (*)
                    printf "\n%b\n" "${RED}*** Answer 'yes' or 'no'. ***${NORMAL}"
                    ;;
            esac
        done
    fi

    # callout hook placeholder (PRE)
    if [[ -n "${agent_pre_hook:-}" && -x "${agent_pre_hook}" ]]; then
        log "Agent PRE hook found, running..."
        set +e
        "${agent_pre_hook}"
        set -e
    fi

    $pkg_cmd $pkg_cmd_args "${package_file}" 2>&1 | tee -a $cosi_install_log
    [[ ${PIPESTATUS[0]} -eq 0 ]] || fail "installing ${package_file}"

    # callout hook placeholder (POST)
    if [[ -n "${agent_post_hook:-}" && -x "${agent_post_hook}" ]]; then
        log "Agent POST hook found, running..."
        set +e
        "${agent_post_hook}"
        set -e
    fi
}

__is_nad_installed() {
    local agent_bin="${agent_dir}/sbin/nad"
    if [[ -x "$agent_bin" ]]; then
        pass "NAD installation found"
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
    local url=${agent_url:-http://127.0.0.1:2609/}
    local err
    local ret

    if [[ $agent_state -eq 2 ]]; then
        set +e
        err=$(\curl -sSf "$url" -o /dev/null 2>&1)
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
        __is_nad_running    #state 2
        __check_nad_url     #state 3
    fi
}

__start_agent() {
    local agent_pid
    local ret

    log "Starting installed agent (if not already running)"

    if [[ ${agent_installed:-0} -gt 0 ]]; then
        if [[ ! -x "/etc/init.d/nad" ]]; then
            fail "Agent init script /etc/init.d/nad not found!"
        fi
        /etc/init.d/nad start
    fi

    set +e
    agent_pid=$(pgrep -f "sbin/nad")
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
    "statsd_type": "${cosi_statsd_type}",
    "custom_options_file": "${cosi_regopts_conf}",
    "cosi_os_dist": "${cosi_os_dist}",
    "cosi_os_vers": "${cosi_os_vers}",
    "cosi_os_arch": "${cosi_os_arch}",
    "cosi_os_type": "${cosi_os_type}"
}
EOF
    [[ $? -eq 0 ]] || fail "Unable to save COSI registration configuration '${cosi_register_config}'"
    [[ -f ${cosi_register_id_file} ]] || echo $cosi_id > ${cosi_register_id_file}
}


__fetch_cosi_utils() {
    local cosi_register_url="${cosi_url}utils"
    local cosi_utils_file="${cosi_cache_dir}/cosi-util.tz"
    local curl_err

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
    log "Unpacking COSI utilities into $(pwd)"
    tar --no-same-owner -xzf "$cosi_utils_file"
    [[ $? -eq 0 ]] || fail "Unable to unpack COSI utiltities"

    log "Installing required node modules for COSI utilities"
    [[ -d node_modules ]] || {
        mkdir node_modules
        [[ $? -eq 0 ]] || fail "Unable to create node_modules directory in COSI utiltities"
    }
    for f in .modules/*.tgz; do tar -xzf "$f" -C node_modules/; done
    [[ $? -eq 0 ]] || fail "Issue(s) unpacking node modules for COSI utiltities"

    log "Cleaning up after node module installation"
    rm -rf .modules
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
    bin_dir="${base_dir}/bin"
    etc_dir="${cosi_dir}/etc"
    reg_dir="${cosi_dir}/registration"

    agent_installed=0
    agent_state=0
    agent_ip="127.0.0.1"
    agent_port="2609"
    agent_type="nad"
    agent_url="http://${agent_ip}:${agent_port}/"
    agent_pre_hook="${cosi_dir}/agent_pre_hook.sh"
    agent_post_hook="${cosi_dir}/agent_post_hook.sh"
    cosi_agent_package_url=""
    cosi_cache_dir="${cosi_dir}/cache"
    cosi_register_config="${etc_dir}/cosi.json"
    cosi_register_id_file="${etc_dir}/.cosi_id"
    cosi_url_args=""
    cosi_util_dir="${cosi_dir}/util"
    cosi_os_arch=""
    cosi_os_dist=""
    cosi_os_type=""
    cosi_os_vers=""
    package_file=""
    cosi_id=""

    #
    # set defaults (if config file not used or options left unset)
    #
    : ${cosi_trace_flag:=0}
    : ${cosi_quiet_flag:=0}
    : ${cosi_confirm_flag:=0}
    : ${cosi_register_flag:=1}
    : ${cosi_regopts_conf:=}
    : ${cosi_save_config_flag:=0}
    : ${cosi_url:=https://setup.circonus.com/}
    : ${cosi_api_url:=https://api.circonus.com/}
    : ${cosi_api_key:=}
    : ${cosi_api_app:=cosi}
    : ${cosi_agent_mode:=pull}
    : ${cosi_statsd_flag:=0}
    : ${cosi_statsd_type:=none}
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
    cosi_install_agent \
    cosi_statsd_type \
    cosi_confirm_flag \
    cosi_register_flag \
    cosi_register_config \
    cosi_quiet_flag \
    package_install_cmd \
    package_install_args \
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
    # note: perl is needed by NAD not the cosi-installer
    local cmd_list="awk cat chgrp chmod curl grep head ln mkdir pgrep sed tar tee uname"
    local cmd
    log_only "Verifying required commands exist. '${cmd_list}'"
    for cmd in $cmd_list; do
        type -P $cmd >> $cosi_install_log 2>&1 || fail "Unable to find '${cmd}' command. Ensure it is available in PATH '${PATH}' before continuing."
    done
    # note: perl is needed by NAD not the cosi-installer
    cmd_list="perl"
    for cmd in $cmd_list; do
        type -P $cmd >> $cosi_install_log 2>&1 || fail "Unable to find '${cmd}' command which is required by NAD. Ensure it is available in PATH '${PATH}' before continuing."
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
        log "Verify Agent install state"
        __check_agent
    else
        pass "Existing agent installation detected."
    fi

    if [[ $agent_state -ne 3 ]]; then
        __start_agent
        __check_agent
    else
        pass "Agent running and responding"
    fi
}


cosi_register() {
    local cosi_script="${cosi_dir}/bin/cosi"
    local cosi_register_cmd="register"
    local cosi_register_opt=""
    local install_nadpush="${cosi_dir}/bin/install_nadpush.sh"
    local install_statsd="${cosi_dir}/bin/install_statsd.sh"

    echo
    __fetch_cosi_utils
    echo
    __save_cosi_register_config
    echo

    if [[ "${cosi_register_flag:-1}" != "1" ]]; then
        log "Not running COSI registration script, --noreg requested"
        return
    fi

    log "Running COSI registration script"

    [[ -x "$cosi_script" ]] || fail "Unable to find cosi command '${cosi_script}'"

    "$cosi_script" "$cosi_register_cmd" | tee -a $cosi_install_log
    [[ ${PIPESTATUS[0]} -eq 0 ]] || fail "Errors encountered during registration."

    if [[ "${cosi_agent_mode:-}" == "push" ]]; then
        echo
        echo
        log "Enabling push mode for agent"
        if [[ -x "$install_nadpush" ]]; then
            $install_nadpush | tee -a $cosi_install_log
            [[ ${PIPESTATUS[0]} -eq 0 ]] || fail "Errors encountered during nadpush installation."
        else
            fail "Agent mode is push, nadpush installer not found."
        fi
    fi

    if [[ ${cosi_statsd_flag:-0} -eq 1 ]]; then
        echo
        echo
        log "Installing Circonus StatsD"
        if [[ -x "$install_statsd" ]]; then
            $install_statsd | tee -a $cosi_install_log
            [[ ${PIPESTATUS[0]} -eq 0 ]] || fail "Errors encountered during Circonus StatsD installation."
        else
            fail "StatsD flag set but, installer not found."
        fi
    fi

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
    echo "To see any of these lists again in the future run, ${cosi_dir}/bin/cosi (graph|check|worksheet) list --long"
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
# short-circuit a request for help or if no arguments are passed
#
if [[ "$*" == *--help* || $# -eq 0 ]]; then
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
    mkdir -p "$cosi_dir"
    [[ $? -eq 0 ]] || {
        printf "\n%b\n" "${RED}Unable to create cosi_dir '${cosi_dir}'.${NORMAL}"
        exit 1
    }
}
cosi_log_dir="${cosi_dir}/log"
[[ -d "$cosi_log_dir" ]] || {
    mkdir -p "$cosi_log_dir"
    [[ $? -eq 0 ]] || {
        printf "\n%b\n" "${RED}Unable to create cosi_log_dir '${cosi_log_dir}'.${NORMAL}"
        exit 1
    }
}
cosi_install_log="${cosi_log_dir}/install.log"
> "$cosi_install_log"

#
# squelch output (log messages to file only)
#
: ${cosi_quiet_flag:=0}
if [[ "$*" == *--quiet* ]]; then
  cosi_quiet_flag=1
fi

log "Started Circonus One step Install on $(date)"

cosi_install "$@"

log "Completed Circonus One step Install on $(date)\n"

## END
# vim:ts=4:sw=4:et

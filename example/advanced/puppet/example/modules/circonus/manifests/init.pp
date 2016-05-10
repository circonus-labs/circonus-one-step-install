
class circonus {

    # NAD requires perl, since we're not using YUM or Apt to
    # install it, perl needs to be installed independently.
    package { "perl":
        ensure => present,
    }

    # pre-install any templates, hooks, etc. needed to pre-seed the nad/cosi environment

    exec { "cosi":
        command => "/usr/bin/curl -sSL ${facts['cosi_install_url']} | bash -s -- ${facts['cosi_install_args']}",
        creates => "/opt/circonus/cosi",
        logoutput => true,
    }

    # if there are any errors see: /opt/circonus/cosi/log/install.log

}

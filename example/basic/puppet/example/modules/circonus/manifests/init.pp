
class circonus {

    # NAD requires perl, since we're not using YUM or APT to
    # install it, perl needs to be installed independently.
    package { "perl":
        ensure => present,
    }

    # run the cosi-install script with supplied arguments
    exec { "cosi":
        command => "/usr/bin/curl -sSL ${facts['cosi_install_url']} | bash -s -- ${facts['cosi_install_args']}",
        creates => "/opt/circonus/cosi/registration/registration-check-system.json",
        logoutput => true,
    }

    # if there are any errors see: /opt/circonus/cosi/log/install.log

}

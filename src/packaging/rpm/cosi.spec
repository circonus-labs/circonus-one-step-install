%define name    cosi
%define version 0.3.1
%define release 1

Summary: Circonus One Step Installer install
Name: %{name}
Version: %{version}
Release: %{release}
License: GPL
Group: Applications/System
BuildArch: noarch
BuildRoot: %{_builddir}/%{name}-root
URL: https://github.com/circonus-labs/circonus-one-step-install
Vendor: Circonus, Inc.
Packager: support@circonus.com
Provides: cosi

%description
This package installs the Circonus One Step Installer shell
install script.

%prep
exit 0

%build
exit 0

%install
rm -rf %{buildroot}
mkdir -p %{buildroot}/opt/circonus/cosi/bin
cp /vagrant/cosi-install.sh %{buildroot}/opt/circonus/cosi/bin/cosi-install.sh
#curl -sSL "https://raw.githubusercontent.com/circonus-labs/circonus-one-step-install/master/src/content/files/cosi-install.sh" \
#    -o %{buildroot}/opt/circonus/cosi/bin/cosi-install.sh

%clean
exit 0

%files
%defattr(0700,root,root)
/opt/circonus/cosi/bin/cosi-install.sh


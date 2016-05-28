#!/usr/bin/env bash

set -eu

cd ~

cp /vagrant/build.rpmmacros ~/.rpmmacros

[[ -d rpmbuild ]] || rpmdev-setuptree

cd ~/rpmbuild/SPECS
cp -v /vagrant/cosi.spec .
rpmbuild -ba cosi.spec

cd ~/rpmbuild/RPMS/noarch
mv -v cosi*.rpm /vagrant

#!/usr/bin/env bash

set -eu

cp -v ../../content/files/cosi-install.sh .

vagrant up
vagrant ssh -c "bash /vagrant/genrpm.sh"
vagrant destroy --force

rm cosi-install.sh


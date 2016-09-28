#!/usr/bin/env bash

set -eu

GREEN=$(tput setaf 2)
YELLOW=$(tput setaf 3)
BLUE=$(tput setaf 4)
BOLD=$(tput bold)
RESET=$(tput sgr0)

echo "${BLUE}Creating temporary copy of cosi-install.sh (${YELLOW}will be deleted after build${BLUE})${RESET}"
cp ../content/files/cosi-install.sh .


pkg_json="../package.json"
echo "${BLUE}Extracting cosi version from ${pkg_json}${RESET}"
cosi_version=$(node -e "console.log(require('${pkg_json}').version);")


echo "${BLUE}Creating rpm macro for cosi version ${YELLOW}${cosi_version}${RESET}"
echo -e "%cosi_version\t${cosi_version}" > build.rpmmacros

echo "${BLUE}Creating up build VM${RESET}"
vagrant up

echo "${BLUE}Building RPM${RESET}"
vagrant ssh -c "bash /vagrant/genrpm.sh"

echo "${BLUE}Destroying build VM${RESET}"
vagrant destroy --force

echo "${BLUE}Cleaning up temporary files${RESET}"
rm cosi-install.sh build.rpmmacros


#!/usr/bin/env bash

set -eu

cd ~vagrant

export PATH=/opt/circonus/bin:$PATH

[[ -d apitests ]] && {
	echo "Removing previous apitests directory"
	rm -rf apitests
}

echo "Creating apitests directory"
mkdir apitests && cd apitests

echo "Copying test suite"
cp -r /vagrant/test/api_test .

echo "Installing tape module (test runner)"
npm install tape

echo "Running tests"
node_modules/tape/bin/tape api_test/*.js

ret=$?

if [[ $ret -eq 0 ]]; then
	echo
	echo "SUCCESS!"
	echo
fi

exit $ret


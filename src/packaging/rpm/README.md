## cosi rpm

installs `/opt/circonus/cosi/bin/cosi-install.sh` so it can be run manually, locally.

1. ensure version in spec is same as in ../../package.json
2. build rpm `vagrant up && vagrant ssh -c "bash /vagrant/build.sh" && vagrant destroy --force`
3. copy resulting rpm to content/files in main src/ directory - cosi-site.js will serve the rpm matching the version in package.json

## cosi rpm

installs `/opt/circonus/cosi/bin/cosi-install.sh` so it can be run manually, locally.

1. update Version || Release in spec if needed.
2. build with `./build.sh`
3. copy resulting rpm to content/files in main src/ directory
4. Update cosi-site.json to serve new file and restart cosi-site

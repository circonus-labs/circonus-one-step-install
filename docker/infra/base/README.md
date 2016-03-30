
Base container layer

* Minimal OS [Alpine Linux v3.3](http://www.alpinelinux.org)
* Update packages
* Ensure latest CA Certificates package installed
* Create Circonus group `circonus`
* Create Circonus user `circonus`
* Create Circonus app directory `/opt/circonus`
* Ensure Circonus app directory is owned by Circonus user

```sh
docker pull alpine:3.3
docker build -t circonus/base:latest --no-cache .
docker tag circonus/base:latest circonus/base:3.3.1
```

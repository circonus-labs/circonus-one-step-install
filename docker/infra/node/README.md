
NodeJS container layer

* Use `circonus/base`
* Install [NodeJS](http://nodejs.org/) package

```sh
docker build -t circonus/node:latest --no-cache .
docker tag circonus/node:latest circonus/node:4.3.1
```

Example use

```sh
docker run -it --rm cosi/node node -v
```

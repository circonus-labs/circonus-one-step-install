COSI site docker

## 1. Build infrastructure (layers) containers

```sh
pushd infra/base && ./build.sh && popd
pushd infra/node && ./build.sh && popd
```

## 2. Build cosi-site container

Even if it fails, it pulls source and installs node modules.

```sh
./build.sh
```

## 3. Test code

Note, we use the NodeJS image, "circonus/node", not the one which may not have built above.

```sh
cd build && docker run -rm -it --read-only --name cosi_site -p 8080:80 -v "$PWD":/app -w /app circonus/node node cosi-site.js --log_dir=stdout
```

Check localhost:8080 to ensure it's running. (or OSX `curl -v "http://$(docker-machine ip default):8080/"`)

When done, use `docker kill cosi_site` (in another terminal window) to stop.


## 4. Test image

To test a built image, let's run it.

```sh
docker run --read-only --rm -p 8080:80 --name cosi_site circonus/cosi-site
```

Check to: http://localhost:8080/

or, on OSX:

`curl -v "http://$(docker-machine ip default):8080/"`


## Running

```sh
docker run --read-only -d -p 8080:80 --name cosi_site circonus/cosi-site
```

* Logs: `docker logs cosi_site`
* Stop: `docker kill cosi_site`

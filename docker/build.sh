#!/usr/bin/env bash

image_name="circonus/cosi-site"

echo
echo "Building ${image_name} Docker container"

echo
echo "Removing previous image, ${image_name}:latest, if it exists"
docker rmi "${image_name}:latest" &>/dev/null

echo
echo "Making up-to-date cosi-site package"
pushd ../src
make package
popd

echo
#
# setup build environment
#
# remove previous build directory (if it exists)
[[ -d build ]] && { 
    echo "Removing previous build/ artifact"
    rm -rf build
}
echo "Creating build/ directory"
mkdir build
echo "Changing to build/ directory"
cd build 
echo "Copy in Dockerfile and .dockerignore"
cp -v ../Dockerfile .
cp -v ../.dockerignore .
echo "Unpacking cosi-site source"
tar -xJf ../../src/cosi-site.tar.xz 

echo
echo "Install default cosi-site configuration"
#
# !! Customize to your needs and copy rather than creating the default each time
#
mv -v etc/example-cosi-site.json etc/cosi-site.json


echo
echo "Generate and install default packages.json"
#
# !! Customize to your needs and copy rather than creating the default each time
#
node bin/osi-package-list.js
mv -v bin/packages.json etc/.

echo
echo "Installing node modules"
docker run --rm -v "$PWD":/app -w /app circonus/node:4.2.4 npm install --production

echo
echo "Build image ${image_name}"
docker build -t "${image_name}:latest" --no-cache .
[[ $? -eq 0 ]] || { echo "Docker build (image=${image_name}:latest} failed, exiting."; exit 1; }

echo
echo "Extracting cosi-site version"
cosi_ver=$(node -e "var x = require('./package.json'); console.log(x.version);")
echo "Found: cosi-site v${cosi_ver}"

echo
echo "Removing old cosi version tag, ${image_name}:${cosi_ver}, if it exists"
docker rmi "${image_name}:${cosi_ver}" &>/dev/null

echo 
echo "Adding cosi version tag to new image ${image_name}:${cosi_ver}"
docker tag -f "${image_name}:latest" "${image_name}:${cosi_ver}"

## END


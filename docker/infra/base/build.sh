#!/usr/bin/env bash

set -eu

image_name="circonus/base"

# ensure correct alpine version

docker pull alpine:3.3

# remove previous image
docker rmi "${image_name}:latest" &>/dev/null

# build new image
docker build -t "${image_name}:latest" --no-cache .
[[ $? -eq 0 ]] || { echo "Docker build (image=${image_name}:latest} failed, exiting."; exit 1; }

# extract os version from new image
os_ver=$(docker run --rm "${image_name}:latest" grep VERSION_ID /etc/os-release | cut -d '=' -f 2)
[[ $? -eq 0 ]] || { echo "Unable to retrieve OS version from ${image_name}:latest, exiting."; exit 1; }

# remove old os version tagged image
docker rmi "${image_name}:${os_ver}" &>/dev/null

# add os version tag to new image
docker tag "${image_name}:latest" "${image_name}:${os_ver}"

#!/usr/bin/env bash

set -eu

image_name="circonus/node"

# remove previous image
docker rmi "${image_name}:latest" &>/dev/null

# build new image
docker build -t "${image_name}:latest" --no-cache .
[[ $? -eq 0 ]] || { echo "Docker build (image=${image_name}:latest} failed, exiting."; exit 1; }

# extract node version from new image
node_ver=$(docker run --rm "${image_name}:latest" node -v)
[[ $? -eq 0 ]] || { echo "Unable to retrieve node version from ${image_name}:latest, exiting."; exit 1; }

node_ver=${node_ver:1}

# remove old os version tagged image
docker rmi "${image_name}:${node_ver}" &>/dev/null

# add os version tag to new image
docker tag "${image_name}:latest" "${image_name}:${node_ver}"

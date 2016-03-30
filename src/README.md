# Circonus One Step Install Site

## Initialize

```sh
# clone repository
git clone https://github.com/circonus/circonus-one-step-install

# install required npm modules (global) if not already installed
npm install -g eslint npm-check-updates pac

# initialize local npm modules
cd util
npm install
cd ..
npm install

# check code to ensure everything looks good
cd util
make check
cd ..
make check

# build a package to ensure environment is good
make package
```


## Installation
## Configuration
## Running



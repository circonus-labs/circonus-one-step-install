DEST ?= ..

ALL_SRC := $(shell git ls-files Makefile cosi-site.js install.sh package.json etc content lib service)

COSI_VER := $(shell node -e "console.log(require('./package.json').version);")

BIN_SRC = cosi-site.js
LIB_SRC = $(shell git ls-files lib)
ETC_SRC = etc/circonus-packages.json
#MOD_SRC = .modules
MOD_SRC = 
OTH_SRC = service content install.sh package.json
DOC_SRC = README.md LICENSE

SITE_TGZ=cosi-site.tar.gz
SITE_PKG=cosi-site-$(COSI_VER).tar.gz
UTIL_TGZ=cosi-util.tar.gz
UTIL_PKG=util/$(UTIL_TGZ)

RPM_FILE=rpm/cosi-${COSI_VER}-1.noarch.rpm

DEST_DIR=$(DEST)/provision/roles/site/files

usage:
	@echo "Use 'make package' to create the COSI-Site package, there are no 'build/compile' steps required."
	@exit 2


all: usage


.PHONY: clean
clean:
	-$(MAKE) -C cosi-util clean
	-rm $(SITE_TGZ)
	-rm content/files/$(UTIL_TGZ)


.PHONY: check
check:
	@echo && echo "Checking cosi-site source"
	eslint $(BIN_SRC) $(LIB_SRC)
	@ncu --prod


.PHONY: install
install:
	@echo "Use 'install.sh' for installation of the COSI-Site package *on the target system*"
	@exit 2

init:
	test -d node_modules || npm install
	make -C util init

package: utils $(SITE_TGZ)
	@echo "Copy cosi-site package to provisioning directory"
	install -d $(DEST_DIR)
	install -vC $(SITE_TGZ) $(DEST_DIR)/$(SITE_PKG)
	@echo

$(RPM_FILE): content/files/cosi-install.sh
	@echo "Removing old RPMs from content/files"
	-rm content/files/cosi-*-1.noarch.rpm
	@echo "Building RPM"
	cd rpm && ./build.sh

.PHONY: utils
utils:
	@echo "Create cosi-util package"
	$(MAKE) -C util package


$(SITE_TGZ): $(ALL_SRC) $(UTIL_PKG) $(RPM_FILE)
	@echo "Create cosi-site package"
	-rm -rf .modules
	test -d node_modules || npm install
	#pac --production
	install -vC $(UTIL_PKG) content/files
	install -vC $(RPM_FILE) content/files
	COPYFILE_DISABLE=true tar -czf $@ $(BIN_SRC) $(LIB_SRC) $(ETC_SRC) $(MOD_SRC) $(OTH_SRC) $(DOC_SRC)

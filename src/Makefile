DEST ?= ..

ALL_SRC := $(shell git ls-files | grep -vE "(util/|statsd|\.eslintrc)")
UTIL_SRC := $(shell git ls-files | grep "util/")

BIN_SRC = cosi-site.js bin/osi-package-list.js
LIB_SRC = $(shell git ls-files lib)
ETC_SRC = etc/circonus-packages.json
MOD_SRC = .modules
OTH_SRC = service content install.sh package.json
DOC_SRC = README.md LICENSE

SITE_PKG=cosi-site.tar.gz
UTIL_TGZ=cosi-util.tar.gz
UTIL_PKG=util/$(UTIL_TGZ)
STATSD_TGZ=cosi-statsd.tar.gz
STATSD_PKG=util/$(STATSD_TGZ)

DEST_DIR=$(DEST)/provision/roles/site/files


usage:
	@echo "Use 'make package' to create the COSI-Site package, there are no 'build/compile' steps required."
	@exit 2


all: usage


.PHONY: clean
clean:
	-make -C cosi-util clean
	-rm $(SITE_PKG)
	-rm $(DEST_DIR)/$(SITE_PKG)
	-rm content/files/$(UTIL_TGZ)
	-rm content/files/$(STATSD_TGZ)


.PHONY: check
check:
	@echo && echo "Checking cosi-site source"
	eslint $(BIN_SRC) $(LIB_SRC)
	@ncu --prod


.PHONY: install
install:
	@echo "Use 'install.sh' for installation of the COSI-Site package *on the target system*"
	@exit 2


package: $(SITE_PKG)
	@echo "Copy cosi-site package to provisioning directory"
	install -d $(DEST_DIR)
	install -vC $(SITE_PKG) $(DEST_DIR)
	@echo

# statsd gets created as a side-effect (it is an ephemeral package)
$(UTIL_PKG): $(UTIL_SRC)
	make -C util package


$(SITE_PKG): $(ALL_SRC) $(UTIL_PKG)
	@echo "Create cosi-site package"
	-rm -rf .modules
	test -d node_modules || npm install
	pac --production
	install -vC $(UTIL_PKG) content/files
	install -vC $(STATSD_PKG) content/files
	COPYFILE_DISABLE=true tar -czf $@ $(BIN_SRC) $(LIB_SRC) $(ETC_SRC) $(MOD_SRC) $(OTH_SRC) $(DOC_SRC)

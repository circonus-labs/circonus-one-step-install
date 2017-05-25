
BABEL	:= ./node_modules/.bin/babel

BIN_SRC	:= $(shell git ls-files bin/*.{js,sh})
LIB_SRC	:= $(shell git ls-files lib)

UTILS	:= cosi-util.tar.gz

# 'yes' = using node v4+, supports ES6 syntax/constructs
# 'no' = old node, transpile down/back to ES5
ES6NODE	?= yes

install:
	@echo "There is no 'default' target, try 'package' or 'dev-install'"

$(UTILS): $(BIN_SRC) $(LIB_SRC) package.json Makefile $(STATSD)
	-rm -rf build
	mkdir build
	test -d node_modules || yarn
ifeq ($(ES6NODE), yes)
	install -d build/bin
	cp bin/*.js build/bin/.
	cp -r lib build/.
else
	$(BABEL) bin/cosi*.js -d build
	$(BABEL) bin/circonus-nadpush.js --out-file build/bin/circonus-nadpush.js
	$(BABEL) lib -d build/lib
endif
	install -m 0700 bin/install_nadpush.sh build/bin/.
	install -m 0700 bin/nadreverse*.sh build/bin/.
	echo '#!/usr/bin/env sh' > build/bin/circonus-nadpush && \
	echo '":" //; exec %%NODE_BIN%% --expose-gc --max-old-space-size=32 --max-executable-size=64 "$$0" "$$@"' >> build/bin/circonus-nadpush && \
	tail -n +3 build/bin/circonus-nadpush.js >> build/bin/circonus-nadpush && \
	chmod 0755 build/bin/circonus-nadpush && \
	rm build/bin/circonus-nadpush.js
	for f in build/bin/*.js; do sed -e 's#/usr/bin/env node#%%NODE_BIN%%#' "$$f" > "$${f%.js}" && chmod 0755 "$${f%.js}" && rm "$$f"; done
	cp -r service build/.
	cp -r rulesets build/.
	# install plugin helpers (non-javascript files)
	# postgres
	install -m 0700 lib/cosi/plugins/postgres/nad-enable.sh build/lib/cosi/plugins/postgres/.
	install -m 0700 lib/cosi/plugins/postgres/nad-disable.sh build/lib/cosi/plugins/postgres/.
	# cassandra
	install -m 0700 lib/cosi/plugins/cassandra/nad-enable.sh build/lib/cosi/plugins/cassandra/.
	install -m 0700 lib/cosi/plugins/cassandra/nad-disable.sh build/lib/cosi/plugins/cassandra/.
	install package.json build/.
	# yarn is MUCH faster than npm
	cd build && yarn install --production
	install Makefile build/.
	install README.md build/.
	install LICENSE build/.
	cp -r test build/.
	# copy test data, if it exists
	if [ -d etc ]; then cp -r etc build/. ; fi
	if [ -d registration ]; then cp -r registration build/.; fi
	COPYFILE_DISABLE=true tar -czf $@ -C build bin lib node_modules service rulesets package.json README.md LICENSE $(STATSD)

.PHONY: check
check:
	@echo && echo "Checking cosi-util source"
	eslint $(BIN_SRC) $(LIB_SRC)
	npm-check --skip-unused --production

init:
	test -d node_modules || yarn

.PHONY: clean
clean:
	-rm -rf .modules
	-rm -rf build
	-rm $(UTILS)
	-rm $(STATSD)

package: $(UTILS)

##
### the following are for use in development
##
# note: the os settings below are for the boxes defined
#       in the Vagrantfile from this directory. To use
#       different boxes, set these variables accordingly.
define COSI_JSON
{
    "api_key": "",
    "api_app": "cosi",
    "api_url": "https://api.circonus.com/v2/",
    "cosi_url": "https://onestep.circonus.com/",
    "agent_mode": "reverse",
    "agent_url": "http://127.0.0.1:2609/",
    "custom_options_file": "",
    "cosi_host_target": "",
    "cosi_broker_id": "",
    "cosi_os_dist": "CentOS",
    "cosi_os_vers": "7.2.1511",
    "cosi_os_arch": "x86_64",
    "cosi_os_type": "Linux",
    "cosi_os_dmi": "VirtualBox"
}
endef

export COSI_JSON

dev-install:
	install -d -m 0755 /opt/circonus
	install -d -m 0755 /opt/circonus/cosi
	install -d -m 0755 /opt/circonus/cosi/etc
	install -d -m 0755 /opt/circonus/cosi/registration
	install -d -m 0755 /opt/circonus/cosi/rulesets
	install -d -m 0755 /opt/circonus/cosi/bin
	install -t /opt/circonus/cosi/bin bin/*
	@cd /opt/circonus/cosi/bin && for f in cosi*.js; do chmod 755 "$$f"; [[ -h "$${f%.js}" ]] || ln -s "$$f" "$${f%.js}"; done
	rsync -r lib /opt/circonus/cosi
	install package.json /opt/circonus/cosi
	cd /opt/circonus/cosi && /opt/node/bin/npm install --production
ifeq (,$(wildcard /opt/circonus/cosi/etc/.cosi_id))
	@# generate a cosi id if one does not exist
	cat /proc/sys/kernel/random/uuid > /opt/circonus/cosi/etc/.cosi_id
endif
ifeq (,$(wildcard /opt/circonus/cosi/etc/cosi.json))
	@# create a stub cosi config if one does not exist
	echo "$$COSI_JSON" > /opt/circonus/cosi/etc/cosi.json
	@echo -e "\n!!!Important!!!\nIt is up to you to *manually* modify /opt/circonus/cosi/etc/cosi.json accordingly. (eg. a valid api token)\n"
endif
	@chown -R root:root /opt/circonus

dev-clean:
ifneq (,$(wildcard /opt/circonus/cosi))
	-/opt/circonus/cosi/bin/cosi reset -a
	@echo "Removing /opt/circonus/cosi"
	-@rm -rf /opt/circonus/cosi
endif

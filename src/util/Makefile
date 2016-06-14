
BABEL	 	:= ./node_modules/.bin/babel

BIN_SRC  	:= $(shell git ls-files bin/*.js)
LIB_SRC  	:= $(shell git ls-files lib)

UTILS 		:= cosi-util.tar.gz
STATSD   	:= cosi-statsd.tar.gz


$(UTILS): $(BIN_SRC) $(LIB_SRC) package.json Makefile $(STATSD)
	-rm -rf .modules
	-rm -rf build
	test -d node_modules || npm install
	install -d build
	$(BABEL) bin/cosi*.js -d build
	$(BABEL) bin/circonus-nadpush.js --out-file build/bin/circonus-nadpush.js
	install -m 0700 bin/install_nadpush.sh build/bin/.
	install -m 0700 bin/install_nadreverse.sh build/bin/.
	install -m 0700 bin/install_statsd.sh build/bin/.
	echo '#!/usr/bin/env sh' > build/bin/circonus-nadpush && \
	echo '":" //; exec %%NODE_BIN%% --expose-gc --max-old-space-size=32 --max-executable-size=64 "$$0" "$$@"' >> build/bin/circonus-nadpush && \
	tail -n +3 build/bin/circonus-nadpush.js >> build/bin/circonus-nadpush && \
	chmod 0755 build/bin/circonus-nadpush && \
	rm build/bin/circonus-nadpush.js
	for f in ./build/bin/*.js; do \
		sed -e 's#/usr/bin/env node#%%NODE_BIN%%#' -i '' "$$f"; \
		chmod 0755 "$$f"; \
		mv "$$f" "$${f%.js}"; \
	done
	$(BABEL) lib -d build/lib
	pac --production
	cp -r .modules build/.
	cp -r service build/.
	cp -r rulesets build/.
	install package.json build/.
	install Makefile build/.
	install README.md build/.
	install LICENSE build/.
	cp -r test build/.
	# copy test data, if it exists
	if [ -d etc ]; then cp -r etc build/. ; fi
	if [ -d registration ]; then cp -r registration build/.; fi
	cp cosi-statsd.tar.gz build/.
	COPYFILE_DISABLE=true tar -C build -czf $@ bin lib service rulesets .modules package.json README.md LICENSE $(STATSD)


.PHONY: check
check:
	@echo && echo "Checking cosi-util source"
	eslint $(BIN_SRC) $(LIB_SRC)
	@ncu --prod


.PHONY: clean
clean:
	-rm -rf .modules
	-rm -rf build
	-rm $(UTILS)
	-rm $(STATSD)


package: $(UTILS)

$(STATSD):
	[ -d tmp ] || mkdir tmp
	cd tmp; \
	curl -sSL -O "https://github.com/etsy/statsd/archive/master.tar.gz"; \
	tar -xzf master.tar.gz; \
	mv statsd-master statsd; \
	curl -sSL "https://raw.githubusercontent.com/maier/circonus-statsd-http/master/circonus.js" -o statsd/backends/circonus.js; \
	cd statsd && npm install --no-optional --production && cd ..; \
	COPYFILE_DISABLE=true tar -czf ../$@ statsd
	rm -rf tmp


##
### the following are for use in the vagrant box during development
### testing node v0.10.x
### e.g. ''' cd /vagrant/build && make install '''
###
### active dev v4.3.x
### e.g. ''' cd /vagrant && make links '''
###
### sets up links to *binaries* e.g. cosi.js -> cosi
### so that 'cosi noun verb' - 'cosi check list'
### commands will work correctly.
##

.PHONY: modules
modules:
	mkdir -p node_modules
	for f in .modules/*.tgz; do tar -zxf "$$f" -C node_modules/; done
	npm rebuild

.PHONY: links
links:
	cd bin && for f in cosi*.js; do chmod 755 "$$f"; [[ -h "$${f%.js}" ]] || ln -s "$$f" "$${f%.js}"; done

.PHONY: install
install: modules links

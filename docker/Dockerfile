FROM circonus/node:4.2.4

MAINTAINER Circonus <support@circonus.com>
LABEL name="cosi-site" \
      version="1.0.0" \
      description="Circonus One Step Install API site"

RUN npm uninstall -g npm

USER circonus

RUN mkdir /opt/circonus/cosi \
    && chown circonus.circonus /opt/circonus/cosi

WORKDIR /opt/circonus/cosi
ADD . /opt/circonus/cosi

EXPOSE 80
ENTRYPOINT [ "node", "cosi-site.js", "--log_dir=stdout" ]

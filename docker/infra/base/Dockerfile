FROM alpine:3.3

RUN apk update && apk upgrade \
  && apk add ca-certificates \
  && rm -rf /var/cache/apk/* \
  && addgroup -S circonus \
  && adduser -G circonus -S circonus \
  && mkdir -p /opt/circonus \
  && chown circonus.circonus /opt/circonus



The cassandra plugin is capable of using protocol_observer to track wire latency metrics pertaining to cassandra. protocol_obserer is not included/installed as part of NAD or COSI. It must be supplied locally.

Example install for CentOS:

```
# install go (if needed)
curl "https://storage.googleapis.com/golang/go1.7.1.linux-amd64.tar.gz" -O
tar -C /usr/local -xzf go1.7.1.linux-amd64.tar.gz
export PATH="$PATH:/usr/local/go/bin"

# setup go environment (if needed)
mkdir godev && cd godev && mkdir bin pkg src
export GOPATH=$(pwd)

# install required headers and libs for wirelatency
yum install -y libpcap-devel

# get the wirelatency source (and dependencies)
go get github.com/circonus-labs/wirelatency

# build
cd $GOPATH/src/github.com/circonus-labs/wirelatency/protocol_observer
go build

# copy resulting protocol_observer binary somewhere in $PATH so the plugin can find it
# or to the default location of /opt/circonus/bin/protocol_observer
cp protocol_observer /opt/circonus/bin
```

> Note that if you run NAD with dropped permissions, you will need to ensure that the user you drop NAD to has sudo access to protocol_observer.  This is required because protocol_observer uses libpcap to capture packets and observe the protocol.

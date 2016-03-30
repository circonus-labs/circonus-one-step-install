# COSI-Site API test suite

In main repository directory (.. from here)

```sh
vagrant up (centos|omnios|ubuntu) && vagrant ssh (centos|omnios|ubuntu) -c /vagrant/test/run_api_tests.sh && vagrant destroy (centos|omnios|ubuntu)
```

For example:
```sh
vagrant up centos && vagrant ssh centos -c /vagrant/test/run_api_tests.sh && vagrant destroy centos
```


# COSI-Site provisioning

* Create a host inventory file [for Ansible]
* Run `ansible-playbook -i <inventory_file> cosi-site.yml` (note, the playbook is applied to _hosts: all_)
* Restart the `cosi-site` service on the provisioned server, if needed. For example, when an **update** is being done and depending upon what changed, e.g. `cosi-site.js` vs. simply content directly served as static files.


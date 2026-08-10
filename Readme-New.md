1. The fix was, Since ODL is talking to OVSDB, and OVSDB shows all the VMs and the Virtual Switches
 and does not have access to high level network abstractions, which Neutron uses to create the
 networks, we get the info from OVSDB, cross reference it with the info from Openstack, and then use that. If Openstack is not available, just show the info from OVSDB.

## TO ODL

```bash
sudo ovs-vsctl del-controller br-int
sudo ovs-vsctl set bridge br-int protocols=OpenFlow13
sudo ovs-vsctl set-manager ptcp:6640:127.0.0.1 tcp:192.168.122.1:6640
sudo ovs-vsctl set-controller br-int tcp:192.168.122.1:6653
```

## TO VERIFY

```bash
sudo tail -n 5 /var/log/openvswitch/ovs-vswitchd.log | grep 6653
```

## TO ONOS

```bash
sudo ovs-vsctl del-controller br-int
sudo ovs-vsctl set bridge br-int protocols=OpenFlow13
sudo ovs-vsctl set-manager ptcp:6640:127.0.0.1 tcp:192.168.122.1:6640
sudo ovs-vsctl set-controller br-int tcp:192.168.122.1:6653
```

## TO VERIFY

```bash
sudo tail -n 5 /var/log/openvswitch/ovs-vswitchd.log | grep 6653
```
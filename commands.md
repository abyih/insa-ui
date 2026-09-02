mininet> h3 iperf -s -u &
mininet> h4 iperf -c 10.0.0.3 -u -b 70M -t 10 -i 1
mininet> h4 iperf -c 10.0.0.3 -u -b 150M -t 8 -i 1
mininet> h4 iperf -c 10.0.0.3 -u -b 100M -P 4 -t 10 -i 1


mininet> h2 iperf -s -u &
mininet> h1 iperf -c 10.0.0.2 -u -b 80M -t 10 -i 1

mininet> iperfudp 80M h4 h3

#!/usr/bin/env bash
# ==============================================================================
# Mininet & OVS Low-Latency QoS Queue Setup Script
# Configures Linux Hierarchical Token Bucket (HTB) queues via Open vSwitch:
#   - Queue 0: High Priority (URLLC / DSCP-46) -> 60 Mbps guaranteed (prio 1)
#   - Queue 1: Standard / Best Effort           -> 15 Mbps guaranteed (prio 2)
#   - Total Link Rate: 80 Mbps
# ==============================================================================

set -euo pipefail

TOTAL_RATE="80000000"   # 80 Mbps
Q0_MIN_RATE="60000000"  # 60 Mbps guaranteed
Q1_MIN_RATE="15000000"  # 15 Mbps guaranteed

usage() {
  echo "Usage: $0 [options] <interface_or_port...>"
  echo "Options:"
  echo "  --clear    Remove QoS and queue configurations from specified ports"
  echo "  --help     Show this help message"
  echo ""
  echo "Examples:"
  echo "  sudo $0 s1-eth1 s1-eth2"
  echo "  sudo $0 --auto               # Auto-detects all s*-eth* and br-int ports"
  echo "  sudo $0 --clear s1-eth1"
  exit 1
}

if [[ $# -eq 0 ]]; then
  usage
fi

CLEAR_MODE=false
AUTO_MODE=false
PORTS=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --clear)
      CLEAR_MODE=true
      shift
      ;;
    --auto)
      AUTO_MODE=true
      shift
      ;;
    --help)
      usage
      ;;
    *)
      PORTS+=("$1")
      shift
      ;;
  esac
done

if [[ "$AUTO_MODE" == true ]]; then
  # Auto-detect mininet switch ports (e.g. s1-eth1, s2-eth1) or ports on br-int
  echo "[QoS] Auto-detecting Mininet switch ports..."
  while read -r port; do
    if [[ -n "$port" ]]; then
      PORTS+=("$port")
    fi
  done < <(ovs-vsctl list-ports s1 2>/dev/null || ovs-vsctl list-ports br-int 2>/dev/null || true)
fi

if [[ ${#PORTS[@]} -eq 0 ]]; then
  echo "Error: No ports specified or detected."
  usage
fi

for PORT in "${PORTS[@]}"; do
  if [[ "$CLEAR_MODE" == true ]]; then
    echo "[QoS] Clearing QoS from port ${PORT}..."
    ovs-vsctl --if-exists clear port "${PORT}" qos || true
    echo "[QoS] Cleared QoS on ${PORT}."
  else
    echo "[QoS] Configuring 60M/15M HTB queues on port ${PORT}..."
    # Clear any existing QoS first to avoid duplicate records
    ovs-vsctl --if-exists clear port "${PORT}" qos || true

    ovs-vsctl set port "${PORT}" qos=@newqos -- \
      --id=@newqos create qos type=linux-htb other-config:max-rate="${TOTAL_RATE}" queues:0=@q0 queues:1=@q1 -- \
      --id=@q0 create queue other-config:min-rate="${Q0_MIN_RATE}" other-config:max-rate="${TOTAL_RATE}" other-config:priority=1 -- \
      --id=@q1 create queue other-config:min-rate="${Q1_MIN_RATE}" other-config:max-rate="${TOTAL_RATE}" other-config:priority=2

    echo "[QoS] ✓ Port ${PORT} successfully configured:"
    echo "       - Queue 0 (DSCP-46 / High Priority): Min ${Q0_MIN_RATE} bps (60 Mbps), Prio 1"
    echo "       - Queue 1 (Standard / Best Effort):  Min ${Q1_MIN_RATE} bps (15 Mbps), Prio 2"
    echo "       - Total Link Ceiling: ${TOTAL_RATE} bps (80 Mbps)"
  fi
done

echo ""
echo "[QoS] Active QoS configuration summary:"
ovs-vsctl list qos
echo ""
echo "[QoS] Done! You can verify live queue stats with:"
echo "      tc -s class show dev <interface_name>"

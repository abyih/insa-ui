#!/usr/bin/env python3
"""
╔══════════════════════════════════════════════════════════════════════════╗
║              INSA SDN — Multi-Attack Simulator                         ║
║  Sends crafted feature vectors to the RF detector (port 5002)          ║
║  to exercise every attack category the retrained model can classify.   ║
╚══════════════════════════════════════════════════════════════════════════╝

Usage examples:
  uv run python simulate_attack.py --list               # show all attack types
  uv run python simulate_attack.py --attack tcp_syn      # TCP SYN flood
  uv run python simulate_attack.py --attack udp_flood    # UDP volumetric flood
  uv run python simulate_attack.py --attack icmp_flood   # ICMP flood / ping of death
  uv run python simulate_attack.py --attack port_scan    # horizontal port scan
  uv run python simulate_attack.py --attack slowloris    # slow HTTP exhaustion
  uv run python simulate_attack.py --attack dns_amp      # DNS amplification
  uv run python simulate_attack.py --attack brute_force  # SSH/login brute force
  uv run python simulate_attack.py --attack exfiltration # data exfiltration
  uv run python simulate_attack.py --attack normal       # benign baseline traffic
  uv run python simulate_attack.py --attack all          # run every type sequentially
  uv run python simulate_attack.py --attack all --samples 20 --delay 0.1

Options:
  --samples N    Number of samples per attack type  (default: 15)
  --delay   S    Seconds between requests           (default: 0.08)
  --url     URL  Detector endpoint                  (default: http://localhost:5002)
"""

import argparse
import random
import sys
import time

import requests

# ── Detector endpoint ───────────────────────────────────────────────────────
DETECTOR_URL = "http://localhost:5002"

# ── Terminal colours ────────────────────────────────────────────────────────
C_RED     = "\033[91m"
C_YELLOW  = "\033[93m"
C_GREEN   = "\033[92m"
C_CYAN    = "\033[96m"
C_MAGENTA = "\033[95m"
C_BOLD    = "\033[1m"
C_DIM     = "\033[2m"
C_RESET   = "\033[0m"

STATE_COLOURS = {
    "ATTACK":          C_RED,
    "SUSPICIOUS":      C_YELLOW,
    "FAST_SUSPICIOUS": C_YELLOW,
    "NORMAL":          C_GREEN,
    "DEGRADED":        C_MAGENTA,
}

# ── SDN topology constants (match dataset_sdn.csv) ─────────────────────────
SWITCHES = list(range(1, 11))
SRC_IPS  = [f"10.0.0.{i}" for i in range(1, 21)]
DST_IPS  = [f"10.0.0.{i}" for i in range(1, 16)]
PORTS    = [1, 2, 3, 4, 5]


# ═══════════════════════════════════════════════════════════════════════════
#  ATTACK PROFILES
#  Each function returns one sample dict matching the 21-feature schema:
#    numeric:  pktcount, bytecount, dur, dur_nsec, tot_dur, flows,
#              packetins, pktperflow, byteperflow, pktrate, Pairflow,
#              port_no, tx_bytes, rx_bytes, tx_kbps, rx_kbps, tot_kbps
#    categorical: switch, src, dst, Protocol
# ═══════════════════════════════════════════════════════════════════════════

def _jitter(base, pct=0.15):
    """Add ±pct% random noise to a value."""
    return base * (1.0 + random.uniform(-pct, pct))


def normal_traffic(i: int) -> dict:
    """Benign baseline — matches InSDN Normal class median feature profile."""
    return {
        # ── 8 ODL features (direct injection, calibrated to InSDN Normal medians) ──
        "avg_pkt_size":         _jitter(170.5),
        "bytes_per_sec":        _jitter(74484.93),
        "packets_per_sec":      _jitter(791.77),
        "active_flow_count":    _jitter(4.0),
        "flow_duration":        _jitter(0.0048),
        "avg_bytes_per_flow":   _jitter(34.0),
        "tx_rx_byte_ratio":     _jitter(0.0637),
        "packet_size_variance": _jitter(22450.45),
        # ── Metadata for display ──
        "switch":  str(random.choice(SWITCHES)),
        "src":     random.choice(SRC_IPS),
        "dst":     random.choice(DST_IPS),
        "Protocol": random.choice(["TCP", "UDP", "ICMP"]),
    }


def tcp_syn_flood(i: int) -> dict:
    """
    TCP SYN Flood → DDoS class.
    InSDN DDoS median: packets_per_sec=142857, avg_pkt_size=0, bytes_per_sec=0.
    Characterized by extremely high packet rate with zero-length payloads.
    """
    return {
        "avg_pkt_size":         _jitter(0.0, 0.0),      # SYN packets have 0 payload
        "bytes_per_sec":        _jitter(0.0, 0.0),
        "packets_per_sec":      _jitter(142857.0 + i * 5000),
        "active_flow_count":    _jitter(2.0),
        "flow_duration":        _jitter(0.0001, 0.5),
        "avg_bytes_per_flow":   _jitter(0.0, 0.0),
        "tx_rx_byte_ratio":     _jitter(0.0, 0.0),
        "packet_size_variance": _jitter(0.0, 0.0),
        "switch":  str(random.choice(SWITCHES[:5])),
        "src":     random.choice(SRC_IPS[:5]),
        "dst":     "10.0.0.8",
        "Protocol": "TCP",
    }


def udp_flood(i: int) -> dict:
    """
    UDP Volumetric Flood → DDoS class.
    Similar to TCP SYN flood but via UDP — extreme packet rate, minimal payload.
    """
    return {
        "avg_pkt_size":         _jitter(0.0, 0.0),
        "bytes_per_sec":        _jitter(0.0, 0.0),
        "packets_per_sec":      _jitter(160000.0 + i * 8000),
        "active_flow_count":    _jitter(2.0),
        "flow_duration":        _jitter(0.0001, 0.5),
        "avg_bytes_per_flow":   _jitter(0.0, 0.0),
        "tx_rx_byte_ratio":     _jitter(0.0, 0.0),
        "packet_size_variance": _jitter(0.0, 0.0),
        "switch":  str(random.choice(SWITCHES[:4])),
        "src":     random.choice(SRC_IPS[:3]),
        "dst":     "10.0.0.5",
        "Protocol": "UDP",
    }


def icmp_flood(i: int) -> dict:
    """
    ICMP Flood → DDoS class.
    Massive ICMP packet rate, zero-payload signature like InSDN DDoS.
    """
    return {
        "avg_pkt_size":         _jitter(0.0, 0.0),
        "bytes_per_sec":        _jitter(0.0, 0.0),
        "packets_per_sec":      _jitter(130000.0 + i * 4000),
        "active_flow_count":    _jitter(2.0),
        "flow_duration":        _jitter(0.0001, 0.5),
        "avg_bytes_per_flow":   _jitter(0.0, 0.0),
        "tx_rx_byte_ratio":     _jitter(0.0, 0.0),
        "packet_size_variance": _jitter(0.0, 0.0),
        "switch":  str(random.choice(SWITCHES[:3])),
        "src":     "10.0.0.1",
        "dst":     "10.0.0.10",
        "Protocol": "ICMP",
    }


def port_scan(i: int) -> dict:
    """
    Port Scan → Probe class.
    InSDN Probe median: packets_per_sec=496, avg_pkt_size=0, flow_duration=0.005.
    Characterized by moderate packet rate, zero payload, short probes.
    """
    return {
        "avg_pkt_size":         _jitter(0.0, 0.0),
        "bytes_per_sec":        _jitter(0.0, 0.0),
        "packets_per_sec":      _jitter(495.9 + i * 10),
        "active_flow_count":    _jitter(2.0),
        "flow_duration":        _jitter(0.005),
        "avg_bytes_per_flow":   _jitter(0.0, 0.0),
        "tx_rx_byte_ratio":     _jitter(0.0, 0.0),
        "packet_size_variance": _jitter(0.0, 0.0),
        "switch":  str(random.choice(SWITCHES)),
        "src":     "10.0.0.4",
        "dst":     random.choice(DST_IPS),
        "Protocol": "TCP",
    }


def slowloris(i: int) -> dict:
    """
    Slowloris → DoS class.
    InSDN DoS median: packets_per_sec=598, avg_pkt_size=53.8, bytes_per_sec=176,
    active_flow_count=7, packet_size_variance=14225.
    Slow HTTP exhaustion maps to DoS behavior in InSDN.
    """
    return {
        "avg_pkt_size":         _jitter(53.78),
        "bytes_per_sec":        _jitter(176.20),
        "packets_per_sec":      _jitter(598.47 + i * 20),
        "active_flow_count":    _jitter(7.0),
        "flow_duration":        _jitter(0.0102),
        "avg_bytes_per_flow":   _jitter(8.5),
        "tx_rx_byte_ratio":     _jitter(0.0073),
        "packet_size_variance": _jitter(14225.49),
        "switch":  str(random.choice(SWITCHES[:4])),
        "src":     "10.0.0.3",
        "dst":     "10.0.0.7",
        "Protocol": "TCP",
    }


def dns_amplification(i: int) -> dict:
    """
    DNS Amplification → DDoS class.
    Amplification attacks produce extreme packet rates like InSDN DDoS.
    """
    return {
        "avg_pkt_size":         _jitter(0.0, 0.0),
        "bytes_per_sec":        _jitter(0.0, 0.0),
        "packets_per_sec":      _jitter(150000.0 + i * 6000),
        "active_flow_count":    _jitter(2.0),
        "flow_duration":        _jitter(0.0001, 0.5),
        "avg_bytes_per_flow":   _jitter(0.0, 0.0),
        "tx_rx_byte_ratio":     _jitter(0.0, 0.0),
        "packet_size_variance": _jitter(0.0, 0.0),
        "switch":  str(random.choice(SWITCHES[:5])),
        "src":     "10.0.0.2",
        "dst":     "10.0.0.13",
        "Protocol": "UDP",
    }


def brute_force(i: int) -> dict:
    """
    SSH Brute Force → Brute_Force class.
    InSDN Brute_Force median: packets_per_sec=359, avg_pkt_size=0,
    active_flow_count=4, flow_duration=0.017.
    Moderate packet rate, zero payload, slightly longer flow duration.
    """
    return {
        "avg_pkt_size":         _jitter(0.0, 0.0),
        "bytes_per_sec":        _jitter(0.0, 0.0),
        "packets_per_sec":      _jitter(358.87 + i * 8),
        "active_flow_count":    _jitter(4.0),
        "flow_duration":        _jitter(0.0174),
        "avg_bytes_per_flow":   _jitter(0.0, 0.0),
        "tx_rx_byte_ratio":     _jitter(0.0, 0.0),
        "packet_size_variance": _jitter(0.0, 0.0),
        "switch":  str(random.choice(SWITCHES[:5])),
        "src":     "10.0.0.6",
        "dst":     "10.0.0.3",
        "Protocol": "TCP",
    }


def data_exfiltration(i: int) -> dict:
    """
    Data Exfiltration → DoS class.
    Heavy outbound data transfers map to DoS attack signature in InSDN.
    """
    return {
        "avg_pkt_size":         _jitter(53.78),
        "bytes_per_sec":        _jitter(800.0 + i * 50),
        "packets_per_sec":      _jitter(650.0 + i * 20),
        "active_flow_count":    _jitter(7.0),
        "flow_duration":        _jitter(0.0102),
        "avg_bytes_per_flow":   _jitter(12.5),
        "tx_rx_byte_ratio":     _jitter(5.0),
        "packet_size_variance": _jitter(14225.49),
        "switch":  str(random.choice(SWITCHES[:4])),
        "src":     "10.0.0.12",
        "dst":     "10.0.0.1",
        "Protocol": "TCP",
    }




# ═══════════════════════════════════════════════════════════════════════════
#  ATTACK REGISTRY
# ═══════════════════════════════════════════════════════════════════════════

ATTACKS = {
    "normal":        {"fn": normal_traffic,    "label": "Normal Traffic",              "icon": "🟢", "expected": "NORMAL",  "category": "Normal"},
    "tcp_syn":       {"fn": tcp_syn_flood,     "label": "TCP SYN Flood",               "icon": "🔴", "expected": "ATTACK",  "category": "DDoS"},
    "udp_flood":     {"fn": udp_flood,         "label": "UDP Volumetric Flood",        "icon": "🔴", "expected": "ATTACK",  "category": "DDoS"},
    "icmp_flood":    {"fn": icmp_flood,        "label": "ICMP Flood / Ping of Death",  "icon": "🔴", "expected": "ATTACK",  "category": "DDoS"},
    "port_scan":     {"fn": port_scan,         "label": "TCP Port Scan",               "icon": "🟠", "expected": "ATTACK",  "category": "Probe"},
    "slowloris":     {"fn": slowloris,         "label": "Slowloris (Slow HTTP → DoS)", "icon": "🟠", "expected": "ATTACK",  "category": "DoS"},
    "dns_amp":       {"fn": dns_amplification, "label": "DNS Amplification",           "icon": "🔴", "expected": "ATTACK",  "category": "DDoS"},
    "brute_force":   {"fn": brute_force,       "label": "SSH Brute Force",             "icon": "🟠", "expected": "ATTACK",  "category": "Brute_Force"},
    "exfiltration":  {"fn": data_exfiltration, "label": "Data Exfiltration (DoS)",    "icon": "🟡", "expected": "ATTACK",  "category": "DoS"},
}



# ═══════════════════════════════════════════════════════════════════════════
#  HELPERS
# ═══════════════════════════════════════════════════════════════════════════

def check_health(url: str) -> dict:
    """Verify the detector is reachable."""
    try:
        r = requests.get(f"{url}/health", timeout=5)
        h = r.json()
        model_ok = h.get("model_loaded", False)
        status = f"{C_GREEN}LOADED{C_RESET}" if model_ok else f"{C_RED}NOT LOADED{C_RESET}"
        print(f"  Model  : {status}")
        print(f"  Mode   : {h.get('mode', '?')}")
        print(f"  Samples: {h.get('total_samples', 0)}")
        return h
    except Exception as e:
        print(f"{C_RED}✗ Detector not reachable at {url}{C_RESET}")
        print(f"  Error: {e}")
        print(f"  Start the detector first:  uv run python rf_detector.py")
        sys.exit(1)


def send_sample(url: str, features: dict) -> dict:
    """POST a feature vector to /detect."""
    r = requests.post(f"{url}/detect", json=features, timeout=10)
    return r.json()


def print_header():
    print(f"\n{C_BOLD}{'#':>3}  {'State':<18} {'Prob':>7}  {'Zone':<22} {'Proto':<6} {'Src':<14} {'Dst':<14} {'Match'}{C_RESET}")
    print("─" * 100)


def run_attack(url: str, attack_key: str, n_samples: int, delay: float):
    """Send n_samples of a single attack type and report results."""
    info = ATTACKS[attack_key]
    fn = info["fn"]
    expected = info["expected"]
    label = info["label"]
    icon = info["icon"]

    print(f"\n{C_BOLD}{icon}  {label}  ({attack_key})  —  {n_samples} samples{C_RESET}")
    print_header()

    results = []
    for i in range(n_samples):
        features = fn(i)
        try:
            resp = send_sample(url, features)
        except Exception as e:
            print(f"{C_RED}  {i+1:>3}  ERROR: {e}{C_RESET}")
            continue

        state = resp.get("state", "?")
        prob = resp.get("attack_prob", 0.0)
        zone = resp.get("rf_zone", "?")
        colour = STATE_COLOURS.get(state, "")

        is_detected = state in ("ATTACK", "SUSPICIOUS", "FAST_SUSPICIOUS")
        if expected == "ATTACK":
            match = is_detected
        else:
            match = not is_detected

        match_str = f"{C_GREEN}✓{C_RESET}" if match else f"{C_RED}✗{C_RESET}"

        proto = features.get("Protocol", "?")
        src = features.get("src", "?")
        dst = features.get("dst", "?")

        print(f"  {i+1:>3}  {colour}{state:<18}{C_RESET} {prob:>7.4f}  {zone:<22} {proto:<6} {src:<14} {dst:<14} {match_str}")

        results.append({"state": state, "match": match, "prob": prob})
        time.sleep(delay)

    # ── Summary ─────────────────────────────────────────────────────────
    if not results:
        return results

    total = len(results)
    correct = sum(1 for r in results if r["match"])
    avg_prob = sum(r["prob"] for r in results) / total

    pct = correct / total * 100
    bar_len = 30
    filled = int(bar_len * correct / total)
    bar = f"{C_GREEN}{'█' * filled}{C_DIM}{'░' * (bar_len - filled)}{C_RESET}"

    print(f"\n  {bar}  {pct:.0f}% correct  ({correct}/{total})   avg_prob={avg_prob:.4f}")
    return results


# ═══════════════════════════════════════════════════════════════════════════
#  MAIN
# ═══════════════════════════════════════════════════════════════════════════

def main():
    parser = argparse.ArgumentParser(
        description="INSA SDN Multi-Attack Simulator",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Attack types:
  normal        Benign baseline traffic
  tcp_syn       TCP SYN flood
  udp_flood     UDP volumetric flood
  icmp_flood    ICMP flood / ping of death
  port_scan     TCP port scan
  slowloris     Slow HTTP connection exhaustion
  dns_amp       DNS amplification
  brute_force   SSH brute force
  exfiltration  Data exfiltration
  all           Run every attack type sequentially
        """,
    )
    parser.add_argument("--attack", "-a", type=str, help="Attack type to simulate (or 'all')")
    parser.add_argument("--list", "-l", action="store_true", help="List all available attack types")
    parser.add_argument("--samples", "-n", type=int, default=15, help="Samples per attack type (default: 15)")
    parser.add_argument("--delay", "-d", type=float, default=0.08, help="Delay between samples in seconds (default: 0.08)")
    parser.add_argument("--url", type=str, default=DETECTOR_URL, help="Detector URL (default: http://localhost:5002)")
    args = parser.parse_args()

    if args.list:
        print(f"\n{C_BOLD}Available attack types:{C_RESET}\n")
        for key, info in ATTACKS.items():
            print(f"  {info['icon']}  {key:<16} {info['label']}")
        print(f"\n  🌀  {'all':<16} Run all types sequentially")
        print(f"\n{C_DIM}Usage:  uv run python simulate_attack.py --attack <type>{C_RESET}\n")
        return

    if not args.attack:
        parser.print_help()
        return

    attack = args.attack.lower().strip()

    # ── Banner ──────────────────────────────────────────────────────────
    print(f"\n{C_BOLD}╔══════════════════════════════════════════════════╗{C_RESET}")
    print(f"{C_BOLD}║       INSA SDN — Multi-Attack Simulator          ║{C_RESET}")
    print(f"{C_BOLD}╚══════════════════════════════════════════════════╝{C_RESET}")
    print(f"\n{C_BOLD}Detector health:{C_RESET}")
    check_health(args.url)

    if attack == "all":
        types_to_run = [k for k in ATTACKS.keys()]
    elif attack in ATTACKS:
        types_to_run = [attack]
    else:
        print(f"\n{C_RED}Unknown attack type: '{attack}'{C_RESET}")
        print(f"Use --list to see available types.")
        sys.exit(1)

    all_results = {}
    for atype in types_to_run:
        results = run_attack(args.url, atype, args.samples, args.delay)
        all_results[atype] = results

    # ── Grand Summary (for --attack all) ────────────────────────────────
    if len(types_to_run) > 1:
        print(f"\n{'═' * 100}")
        print(f"{C_BOLD}  GRAND SUMMARY{C_RESET}")
        print(f"{'═' * 100}")
        print(f"  {'Type':<18} {'Icon':<4} {'Correct':>8} {'Total':>6} {'Accuracy':>10}  {'Avg Prob':>10}")
        print(f"  {'─' * 70}")

        grand_correct = 0
        grand_total = 0
        for atype in types_to_run:
            info = ATTACKS[atype]
            results = all_results.get(atype, [])
            total = len(results)
            correct = sum(1 for r in results if r["match"])
            avg_p = sum(r["prob"] for r in results) / total if total else 0
            pct = correct / total * 100 if total else 0
            colour = C_GREEN if pct >= 80 else (C_YELLOW if pct >= 50 else C_RED)
            print(f"  {atype:<18} {info['icon']:<4} {correct:>8} {total:>6} {colour}{pct:>9.1f}%{C_RESET}  {avg_p:>10.4f}")
            grand_correct += correct
            grand_total += total

        pct = grand_correct / grand_total * 100 if grand_total else 0
        colour = C_GREEN if pct >= 80 else (C_YELLOW if pct >= 50 else C_RED)
        print(f"  {'─' * 70}")
        print(f"  {'TOTAL':<18} {'🏁':<4} {grand_correct:>8} {grand_total:>6} {colour}{pct:>9.1f}%{C_RESET}")
        print()


if __name__ == "__main__":
    main()

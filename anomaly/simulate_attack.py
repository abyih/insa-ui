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
    """Benign baseline — low packet rate, balanced TX/RX, moderate duration."""
    dur = random.uniform(200, 500)
    dur_nsec = random.randint(100_000_000, 900_000_000)
    pktcount = random.randint(500, 8000)
    bytecount = pktcount * random.randint(400, 900)
    flows = random.randint(3, 10)
    tx = random.randint(50_000_000, 150_000_000)
    rx = int(tx * random.uniform(0.85, 1.15))
    kbps = random.randint(500, 1500)
    return {
        "pktcount":    pktcount,
        "bytecount":   bytecount,
        "dur":         int(dur),
        "dur_nsec":    dur_nsec,
        "tot_dur":     int(dur * 1e9 + dur_nsec),
        "flows":       flows,
        "packetins":   random.randint(3000, 7000),
        "pktperflow":  pktcount // max(flows, 1),
        "byteperflow": bytecount // max(flows, 1),
        "pktrate":     int(pktcount / max(dur, 1)),
        "Pairflow":    random.choice([0, 1]),
        "port_no":     random.choice(PORTS),
        "tx_bytes":    tx,
        "rx_bytes":    rx,
        "tx_kbps":     kbps,
        "rx_kbps":     int(kbps * random.uniform(0.9, 1.1)),
        "tot_kbps":    kbps * 2,
        "switch":      str(random.choice(SWITCHES)),
        "src":         random.choice(SRC_IPS),
        "dst":         random.choice(DST_IPS),
        "Protocol":    random.choice(["TCP", "UDP", "ICMP"]),
    }


def tcp_syn_flood(i: int) -> dict:
    """
    TCP SYN Flood — massive packet counts, tiny packets (SYN = ~60 bytes),
    very high pktrate, extremely asymmetric TX vs RX (mostly outbound),
    short duration bursts, single destination.
    """
    dur = random.randint(10, 60)
    pktcount = int(_jitter(200_000 + i * 8_000))
    bytecount = pktcount * random.randint(54, 74)  # SYN packets are small
    flows = random.randint(1, 3)
    tx = int(_jitter(250_000_000 + i * 5_000_000))
    rx = random.randint(500, 5000)  # almost no replies (half-open)
    return {
        "pktcount":    pktcount,
        "bytecount":   bytecount,
        "dur":         dur,
        "dur_nsec":    random.randint(0, 999_000_000),
        "tot_dur":     int(dur * 1e9),
        "flows":       flows,
        "packetins":   int(_jitter(15_000)),
        "pktperflow":  pktcount // max(flows, 1),
        "byteperflow": bytecount // max(flows, 1),
        "pktrate":     int(pktcount / max(dur, 1)),
        "Pairflow":    0,
        "port_no":     random.choice(PORTS[:3]),
        "tx_bytes":    tx,
        "rx_bytes":    rx,
        "tx_kbps":     int(tx / 1024 / max(dur, 1)),
        "rx_kbps":     0,
        "tot_kbps":    int(tx / 1024 / max(dur, 1)),
        "switch":      str(random.choice(SWITCHES[:5])),
        "src":         random.choice(SRC_IPS[:5]),
        "dst":         "10.0.0.8",  # single target
        "Protocol":    "TCP",
    }


def udp_flood(i: int) -> dict:
    """
    UDP Volumetric Flood — high bytecount, large packets (1400+ bytes),
    enormous bytes_per_second, very few flows, low duration.
    """
    dur = random.randint(15, 80)
    pktcount = int(_jitter(150_000 + i * 6_000))
    bytecount = pktcount * random.randint(1200, 1480)
    flows = random.randint(1, 3)
    tx = int(_jitter(300_000_000 + i * 10_000_000))
    rx = random.randint(1000, 8000)
    return {
        "pktcount":    pktcount,
        "bytecount":   bytecount,
        "dur":         dur,
        "dur_nsec":    random.randint(0, 999_000_000),
        "tot_dur":     int(dur * 1e9),
        "flows":       flows,
        "packetins":   int(_jitter(12_000)),
        "pktperflow":  pktcount // max(flows, 1),
        "byteperflow": bytecount // max(flows, 1),
        "pktrate":     int(pktcount / max(dur, 1)),
        "Pairflow":    0,
        "port_no":     random.choice(PORTS[:3]),
        "tx_bytes":    tx,
        "rx_bytes":    rx,
        "tx_kbps":     int(tx / 1024 / max(dur, 1)),
        "rx_kbps":     0,
        "tot_kbps":    int(tx / 1024 / max(dur, 1)),
        "switch":      str(random.choice(SWITCHES[:4])),
        "src":         random.choice(SRC_IPS[:3]),
        "dst":         "10.0.0.5",
        "Protocol":    "UDP",
    }


def icmp_flood(i: int) -> dict:
    """
    ICMP Flood / Ping of Death — huge ICMP packet count, oversized ping
    payloads (>1000 bytes), extreme pktrate, single source hammering.
    """
    dur = random.randint(20, 90)
    pktcount = int(_jitter(180_000 + i * 5_000))
    bytecount = pktcount * random.randint(1000, 1500)  # oversized ICMP
    flows = random.randint(1, 2)
    tx = int(_jitter(200_000_000 + i * 4_000_000))
    rx = random.randint(2000, 10_000)
    return {
        "pktcount":    pktcount,
        "bytecount":   bytecount,
        "dur":         dur,
        "dur_nsec":    random.randint(0, 999_000_000),
        "tot_dur":     int(dur * 1e9),
        "flows":       flows,
        "packetins":   int(_jitter(10_000)),
        "pktperflow":  pktcount // max(flows, 1),
        "byteperflow": bytecount // max(flows, 1),
        "pktrate":     int(pktcount / max(dur, 1)),
        "Pairflow":    0,
        "port_no":     random.choice(PORTS[:2]),
        "tx_bytes":    tx,
        "rx_bytes":    rx,
        "tx_kbps":     int(tx / 1024 / max(dur, 1)),
        "rx_kbps":     int(rx / 1024 / max(dur, 1)),
        "tot_kbps":    int((tx + rx) / 1024 / max(dur, 1)),
        "switch":      str(random.choice(SWITCHES[:3])),
        "src":         "10.0.0.1",
        "dst":         "10.0.0.10",
        "Protocol":    "ICMP",
    }


def port_scan(i: int) -> dict:
    """
    Port Scan — many small TCP SYN probes across many flows, tiny packets,
    very high flow count relative to packet count, rapid probing.
    """
    dur = random.randint(5, 40)
    flows = int(_jitter(200 + i * 10))  # many unique flows = many ports probed
    pktcount = flows * random.randint(1, 3)  # 1-3 packets per probed port
    bytecount = pktcount * random.randint(54, 80)
    tx = int(_jitter(5_000_000))
    rx = random.randint(500, 3000)  # RSTs or silence
    return {
        "pktcount":    pktcount,
        "bytecount":   bytecount,
        "dur":         dur,
        "dur_nsec":    random.randint(0, 999_000_000),
        "tot_dur":     int(dur * 1e9),
        "flows":       flows,
        "packetins":   int(_jitter(8_000 + i * 200)),
        "pktperflow":  max(pktcount // max(flows, 1), 1),
        "byteperflow": bytecount // max(flows, 1),
        "pktrate":     int(pktcount / max(dur, 1)),
        "Pairflow":    0,
        "port_no":     random.choice(PORTS),
        "tx_bytes":    tx,
        "rx_bytes":    rx,
        "tx_kbps":     int(tx / 1024 / max(dur, 1)),
        "rx_kbps":     0,
        "tot_kbps":    int(tx / 1024 / max(dur, 1)),
        "switch":      str(random.choice(SWITCHES)),
        "src":         "10.0.0.4",
        "dst":         random.choice(DST_IPS),  # scanning many hosts
        "Protocol":    "TCP",
    }


def slowloris(i: int) -> dict:
    """
    Slowloris — slow drip TCP connections: very long duration, very low
    pktrate, many persistent flows kept half-open, tiny bytecount.
    """
    dur = random.randint(500, 1800)  # very long-lived connections
    flows = int(_jitter(50 + i * 5))
    pktcount = flows * random.randint(2, 6)  # minimal data per connection
    bytecount = pktcount * random.randint(40, 120)
    tx = random.randint(10_000, 80_000)
    rx = random.randint(5_000, 40_000)
    return {
        "pktcount":    pktcount,
        "bytecount":   bytecount,
        "dur":         dur,
        "dur_nsec":    random.randint(0, 999_000_000),
        "tot_dur":     int(dur * 1e9),
        "flows":       flows,
        "packetins":   random.randint(200, 800),
        "pktperflow":  max(pktcount // max(flows, 1), 1),
        "byteperflow": bytecount // max(flows, 1),
        "pktrate":     max(int(pktcount / max(dur, 1)), 1),
        "Pairflow":    1,
        "port_no":     random.choice(PORTS[:3]),
        "tx_bytes":    tx,
        "rx_bytes":    rx,
        "tx_kbps":     0,
        "rx_kbps":     0,
        "tot_kbps":    0,
        "switch":      str(random.choice(SWITCHES[:4])),
        "src":         "10.0.0.3",
        "dst":         "10.0.0.7",
        "Protocol":    "TCP",
    }


def dns_amplification(i: int) -> dict:
    """
    DNS Amplification — spoofed UDP queries to open resolvers producing
    massive inbound traffic: RX >> TX, huge bytecount, small pktcount on
    the query side but enormous response bytes.
    """
    dur = random.randint(20, 100)
    pktcount = int(_jitter(80_000 + i * 3_000))
    bytecount = pktcount * random.randint(800, 4000)  # amplified responses
    flows = random.randint(2, 6)
    tx = random.randint(50_000, 200_000)  # small queries
    rx = int(_jitter(400_000_000 + i * 8_000_000))  # huge amplified replies
    return {
        "pktcount":    pktcount,
        "bytecount":   bytecount,
        "dur":         dur,
        "dur_nsec":    random.randint(0, 999_000_000),
        "tot_dur":     int(dur * 1e9),
        "flows":       flows,
        "packetins":   int(_jitter(9_000)),
        "pktperflow":  pktcount // max(flows, 1),
        "byteperflow": bytecount // max(flows, 1),
        "pktrate":     int(pktcount / max(dur, 1)),
        "Pairflow":    0,
        "port_no":     random.choice(PORTS[:3]),
        "tx_bytes":    tx,
        "rx_bytes":    rx,
        "tx_kbps":     int(tx / 1024 / max(dur, 1)),
        "rx_kbps":     int(rx / 1024 / max(dur, 1)),
        "tot_kbps":    int((tx + rx) / 1024 / max(dur, 1)),
        "switch":      str(random.choice(SWITCHES[:5])),
        "src":         "10.0.0.2",
        "dst":         "10.0.0.13",
        "Protocol":    "UDP",
    }


def brute_force(i: int) -> dict:
    """
    SSH / Login Brute Force — rapid repeated TCP connections to port 22,
    medium packet size (credentials), high packetins, moderate pktrate,
    many short-lived flows.
    """
    dur = random.randint(30, 150)
    flows = int(_jitter(80 + i * 5))
    pktcount = flows * random.randint(8, 20)  # login attempt packets
    bytecount = pktcount * random.randint(180, 350)
    tx = int(_jitter(30_000_000 + i * 500_000))
    rx = int(_jitter(15_000_000))
    return {
        "pktcount":    pktcount,
        "bytecount":   bytecount,
        "dur":         dur,
        "dur_nsec":    random.randint(0, 999_000_000),
        "tot_dur":     int(dur * 1e9),
        "flows":       flows,
        "packetins":   int(_jitter(10_000 + i * 300)),
        "pktperflow":  pktcount // max(flows, 1),
        "byteperflow": bytecount // max(flows, 1),
        "pktrate":     int(pktcount / max(dur, 1)),
        "Pairflow":    1,
        "port_no":     random.choice(PORTS[:3]),
        "tx_bytes":    tx,
        "rx_bytes":    rx,
        "tx_kbps":     int(tx / 1024 / max(dur, 1)),
        "rx_kbps":     int(rx / 1024 / max(dur, 1)),
        "tot_kbps":    int((tx + rx) / 1024 / max(dur, 1)),
        "switch":      str(random.choice(SWITCHES[:5])),
        "src":         "10.0.0.6",
        "dst":         "10.0.0.3",
        "Protocol":    "TCP",
    }


def data_exfiltration(i: int) -> dict:
    """
    Data Exfiltration — sustained large TCP uploads, very high TX with
    near-zero RX, large packets, moderate steady pktrate over long
    duration, low flow count (single tunnel).
    """
    dur = random.randint(200, 600)
    pktcount = int(_jitter(120_000 + i * 3_000))
    bytecount = pktcount * random.randint(1300, 1500)  # MTU-sized uploads
    flows = random.randint(1, 3)
    tx = int(_jitter(500_000_000 + i * 10_000_000))
    rx = random.randint(5_000, 30_000)  # ACKs only
    return {
        "pktcount":    pktcount,
        "bytecount":   bytecount,
        "dur":         dur,
        "dur_nsec":    random.randint(0, 999_000_000),
        "tot_dur":     int(dur * 1e9),
        "flows":       flows,
        "packetins":   random.randint(2000, 5000),
        "pktperflow":  pktcount // max(flows, 1),
        "byteperflow": bytecount // max(flows, 1),
        "pktrate":     int(pktcount / max(dur, 1)),
        "Pairflow":    0,
        "port_no":     random.choice(PORTS[:3]),
        "tx_bytes":    tx,
        "rx_bytes":    rx,
        "tx_kbps":     int(tx / 1024 / max(dur, 1)),
        "rx_kbps":     0,
        "tot_kbps":    int(tx / 1024 / max(dur, 1)),
        "switch":      str(random.choice(SWITCHES[:4])),
        "src":         "10.0.0.12",
        "dst":         "10.0.0.1",
        "Protocol":    "TCP",
    }


# ═══════════════════════════════════════════════════════════════════════════
#  ATTACK REGISTRY
# ═══════════════════════════════════════════════════════════════════════════

ATTACKS = {
    "normal":        {"fn": normal_traffic,    "label": "Normal Traffic",          "icon": "🟢", "expected": "NORMAL"},
    "tcp_syn":       {"fn": tcp_syn_flood,     "label": "TCP SYN Flood",           "icon": "🔴", "expected": "ATTACK"},
    "udp_flood":     {"fn": udp_flood,         "label": "UDP Volumetric Flood",    "icon": "🔴", "expected": "ATTACK"},
    "icmp_flood":    {"fn": icmp_flood,        "label": "ICMP Flood / Ping of Death", "icon": "🔴", "expected": "ATTACK"},
    "port_scan":     {"fn": port_scan,         "label": "TCP Port Scan",           "icon": "🟠", "expected": "ATTACK"},
    "slowloris":     {"fn": slowloris,         "label": "Slowloris (Slow HTTP)",   "icon": "🟠", "expected": "ATTACK"},
    "dns_amp":       {"fn": dns_amplification, "label": "DNS Amplification",       "icon": "🔴", "expected": "ATTACK"},
    "brute_force":   {"fn": brute_force,       "label": "SSH Brute Force",         "icon": "🟠", "expected": "ATTACK"},
    "exfiltration":  {"fn": data_exfiltration, "label": "Data Exfiltration",       "icon": "🟡", "expected": "ATTACK"},
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

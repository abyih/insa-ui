#!/usr/bin/env python3
"""
Verify RF feature extraction matches training definitions.
"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from features import PortConnectorExtractor

# Test with mock data to verify calculations
def test_feature_calculations():
    print("=" * 80)
    print("RF FEATURE COMPATIBILITY VERIFICATION")
    print("=" * 80)
    
    print("\n1. TRAINING DEFINITIONS (from train_classifier.py):")
    print("   avg_pkt_size = bytecount / (pktcount + EPS)")
    print("   total_duration_sec = dur + dur_nsec / 1e9  (per-flow duration)")
    print("   bytes_per_sec = bytecount / (total_dur + EPS)")
    print("   tx_rx_byte_asymmetry = |tx_bytes - rx_bytes| / (tx_bytes + rx_bytes + EPS)")
    print("   pktcount = pktcount (raw count)")
    print("   tx_bytes = tx_bytes (raw count)")
    
    print("\n2. LIVE EXTRACTION DEFINITIONS:")
    print("   avg_pkt_size = delta_bytes / delta_packets (if packets > 0)")
    print("   total_duration_sec = average flow duration from ODL")
    print("   bytes_per_sec = delta_bytes / poll_interval")
    print("   tx_rx_byte_asymmetry = |delta_tx - delta_rx| / (delta_tx + delta_rx + EPS)")
    print("   pktcount = delta_packets")
    print("   tx_bytes = delta_tx_bytes")
    
    print("\n3. KEY DIFFERENCES:")
    print("   ❌ TIME SCALE: Training = per-flow, Live = per-time-interval")
    print("   ❌ COUNTER TYPE: Training = raw totals, Live = deltas")
    print("   ✅ ASYMMETRY: Now matches training formula (fixed)")
    
    print("\n4. RECOMMENDATION:")
    print("   The current live feature extraction is fundamentally incompatible")
    print("   with the trained RF model due to different measurement scales.")
    print("   ")
    print("   Options:")
    print("   A) Retrain RF model with per-time-interval features")
    print("   B) Aggregate ODL flows to match per-flow dataset format")
    print("   C) Accept degraded performance (not recommended)")
    
    print("\n" + "=" * 80)
    
    # Test specific calculations
    print("\n5. CALCULATION TEST:")
    
    # Mock values
    bytecount = 120000  # Training: total bytes in flow
    pktcount = 1000     # Training: total packets in flow
    dur = 5.5           # Training: flow duration
    tx_bytes = 80000    # Training: TX bytes in flow
    rx_bytes = 40000    # Training: RX bytes in flow
    
    # Live equivalents (deltas over 15s poll)
    delta_bytes = 120000   # Bytes in last 15s
    delta_packets = 1000   # Packets in last 15s
    avg_duration = 5.5     # Average flow duration
    delta_tx = 80000       # TX bytes in last 15s
    delta_rx = 40000       # RX bytes in last 15s
    poll_interval = 15.0   # Polling interval
    
    EPS = 1e-9
    
    print("\n   Training-style calculations (per-flow):")
    train_avg_pkt = bytecount / (pktcount + EPS)
    train_total_dur = dur
    train_bytes_per_sec = bytecount / (dur + EPS)
    train_asymmetry = abs(tx_bytes - rx_bytes) / (tx_bytes + rx_bytes + EPS)
    
    print(f"     avg_pkt_size: {train_avg_pkt:.2f}")
    print(f"     total_duration_sec: {train_total_dur:.2f}")
    print(f"     bytes_per_sec: {train_bytes_per_sec:.2f}")
    print(f"     tx_rx_byte_asymmetry: {train_asymmetry:.4f}")
    print(f"     pktcount: {pktcount}")
    print(f"     tx_bytes: {tx_bytes}")
    
    print("\n   Live calculations (per-time-interval):")
    live_avg_pkt = delta_bytes / (delta_packets + EPS) if delta_packets > 0 else 0.0
    live_total_dur = avg_duration
    live_bytes_per_sec = delta_bytes / poll_interval
    live_asymmetry = abs(delta_tx - delta_rx) / (delta_tx + delta_rx + EPS)
    
    print(f"     avg_pkt_size: {live_avg_pkt:.2f}")
    print(f"     total_duration_sec: {live_total_dur:.2f}")
    print(f"     bytes_per_sec: {live_bytes_per_sec:.2f}")
    print(f"     tx_rx_byte_asymmetry: {live_asymmetry:.4f}")
    print(f"     pktcount: {delta_packets}")
    print(f"     tx_bytes: {delta_tx}")
    
    print("\n   Comparison:")
    print(f"     avg_pkt_size: Same ({train_avg_pkt:.2f} vs {live_avg_pkt:.2f})")
    print(f"     total_duration_sec: Same ({train_total_dur:.2f} vs {live_total_dur:.2f})")
    print(f"     bytes_per_sec: DIFFERENT ({train_bytes_per_sec:.2f} vs {live_bytes_per_sec:.2f})")
    print(f"     asymmetry: Same ({train_asymmetry:.4f} vs {live_asymmetry:.4f})")
    print(f"     pktcount/tx_bytes: Same values but DIFFERENT MEANING")
    
    print("\n" + "=" * 80)
    return False  # Incompatible

if __name__ == "__main__":
    test_feature_calculations()
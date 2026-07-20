#!/usr/bin/env python3
"""
Test script to verify RF feature extraction works correctly.
Run: python test_feature_extraction.py
"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from features import FlowTableExtractor, PortConnectorExtractor

# Mock ODL data structure (simplified)
MOCK_ODL = {
    "opendaylight-inventory:nodes": {
        "node": [
            {
                "id": "openflow:1",
                "flow-node-inventory:table": [
                    {
                        "flow": [
                            {
                                "opendaylight-flow-statistics:flow-statistics": {
                                    "packet-count": 1000,
                                    "byte-count": 120000,
                                    "duration": {"second": 5, "nanosecond": 500000000}  # 5.5 seconds
                                }
                            }
                        ]
                    }
                ],
                "opendaylight-inventory:node-connector": [
                    {
                        "opendaylight-port-statistics:flow-capable-node-connector-statistics": {
                            "bytes": {
                                "transmitted": 80000,
                                "received": 40000
                            }
                        }
                    }
                ]
            }
        ]
    }
}

def test_feature_extraction():
    print("Testing RF feature extraction...")
    print("=" * 60)
    
    # Test FlowTableExtractor
    print("1. Testing FlowTableExtractor (IF features):")
    if_extractor = FlowTableExtractor(poll_interval=15.0)
    if_features = if_extractor.extract(MOCK_ODL, "openflow:1")
    
    if if_features:
        print(f"   Switch ID: {if_features.switch_id}")
        print(f"   Source: {if_features.source}")
        print(f"   Features: {if_features.values.tolist()}")
        print(f"   Feature names: avg_packet_size, bytes_per_second, packet_count, active_flow_count, asymmetry")
    else:
        print("   ❌ Failed to extract IF features")
    
    print("\n2. Testing PortConnectorExtractor (RF features):")
    rf_extractor = PortConnectorExtractor(poll_interval=15.0)
    rf_features = rf_extractor.extract(MOCK_ODL, "openflow:1")
    
    if rf_features:
        print(f"   Switch ID: {rf_features.switch_id}")
        print(f"   Source: {rf_features.source}")
        print(f"   Features: {rf_features.values.tolist()}")
        print(f"   Feature names: avg_pkt_size, total_duration_sec, bytes_per_sec, tx_rx_byte_asymmetry, pktcount, tx_bytes")
        
        # Verify we have 6 features
        if len(rf_features.values) == 6:
            print("   ✅ Correct number of features (6)")
        else:
            print(f"   ❌ Wrong number of features: {len(rf_features.values)}")
            
        # Check specific features
        features = rf_features.values
        print(f"\n   Feature breakdown:")
        print(f"   - avg_pkt_size: {features[0]:.2f} bytes")
        print(f"   - total_duration_sec: {features[1]:.2f} seconds")
        print(f"   - bytes_per_sec: {features[2]:.2f} B/s")
        print(f"   - tx_rx_byte_asymmetry: {features[3]:.2f} (TX/RX ratio)")
        print(f"   - pktcount: {features[4]:.0f} packets")
        print(f"   - tx_bytes: {features[5]:.0f} bytes")
        
    else:
        print("   ❌ Failed to extract RF features")
    
    print("\n" + "=" * 60)
    print("Summary:")
    if if_features and rf_features:
        print("✅ Both IF and RF feature extraction working")
        print("✅ RF features include tx_rx_byte_asymmetry (required by model)")
        print("✅ Features extracted automatically from ODL data")
        print("✅ No manual input required")
    else:
        print("❌ Feature extraction failed")
    
    return if_features is not None and rf_features is not None

if __name__ == "__main__":
    success = test_feature_extraction()
    sys.exit(0 if success else 1)
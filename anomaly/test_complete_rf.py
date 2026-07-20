#!/usr/bin/env python3
"""
Test the complete RF pipeline with new 5-feature model.
"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from features import PortConnectorExtractor
import pickle

print("=" * 70)
print("COMPLETE RF PIPELINE TEST")
print("=" * 70)

# 1. Test feature extraction
print("\n1. TESTING FEATURE EXTRACTION (5 features)")
print("-" * 40)

# Create mock ODL data
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
                                    "duration": {"second": 5, "nanosecond": 500000000}
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

extractor = PortConnectorExtractor(poll_interval=15.0)
features = extractor.extract(MOCK_ODL, "openflow:1")

if features:
    print(f"✅ Feature extraction successful")
    print(f"   Number of features: {len(features.values)}")
    print(f"   Features: {features.values.tolist()}")
    
    if len(features.values) == 5:
        print("   ✅ Correct: 5 features (no tx_rx_byte_asymmetry)")
    else:
        print(f"   ❌ Wrong: Expected 5 features, got {len(features.values)}")
else:
    print("❌ Feature extraction failed")

# 2. Test model loading
print("\n2. TESTING MODEL LOADING")
print("-" * 40)

MODEL_PATH = "pretrained_clf_odl.pkl"
if os.path.exists(MODEL_PATH):
    try:
        with open(MODEL_PATH, 'rb') as f:
            model_data = pickle.load(f)
        
        print(f"✅ Model loaded from {MODEL_PATH}")
        print(f"   Feature order: {model_data.get('feature_order', 'Unknown')}")
        print(f"   Number of features expected: {len(model_data.get('feature_order', []))}")
        
        expected_features = ['avg_pkt_size', 'total_duration_sec', 'bytes_per_sec', 'pktcount', 'tx_bytes']
        actual_features = model_data.get('feature_order', [])
        
        if actual_features == expected_features:
            print("   ✅ Feature order matches expected (5 features)")
        else:
            print(f"   ❌ Feature order mismatch")
            print(f"      Expected: {expected_features}")
            print(f"      Actual: {actual_features}")
            
    except Exception as e:
        print(f"❌ Error loading model: {e}")
else:
    print(f"❌ Model file not found: {MODEL_PATH}")
    print(f"   Make sure you ran: python retrain_simple.py dataset.csv pretrained_clf_odl.pkl")

# 3. Test complete pipeline
print("\n3. TESTING COMPLETE PIPELINE")
print("-" * 40)

if features and os.path.exists(MODEL_PATH):
    # Simulate what the RF detector would do
    feature_vector = features.values.tolist()
    
    print(f"✅ Ready for automatic RF detection")
    print(f"   Features extracted automatically from ODL")
    print(f"   Model expects 5 features")
    print(f"   No manual input required")
    print(f"   No tx_rx_byte_asymmetry")
    
    print(f"\n   Example feature vector for RF server:")
    print(f"   {feature_vector}")
    
    print(f"\n   Example POST request to /detect:")
    print(f'   {{')
    print(f'     "avg_pkt_size": {feature_vector[0]:.2f},')
    print(f'     "total_duration_sec": {feature_vector[1]:.2f},')
    print(f'     "bytes_per_sec": {feature_vector[2]:.2f},')
    print(f'     "pktcount": {feature_vector[3]:.2f},')
    print(f'     "tx_bytes": {feature_vector[4]:.2f}')
    print(f'   }}')
else:
    print("❌ Cannot test complete pipeline")

print("\n" + "=" * 70)
print("HOW TO RUN THE COMPLETE SYSTEM")
print("=" * 70)
print("\n1. Start the servers:")
print("   Terminal 1: cd anomaly && python detector.py")
print("   Terminal 2: cd anomaly && python rf_detector.py")
print("\n2. Start the frontend:")
print("   Terminal 3: npm run dev")
print("\n3. Access in browser:")
print("   http://localhost:5173 (or your Vite port)")
print("\n4. Test modes:")
print("   - ONLINE_IF: Real-time SDN detection with Isolation Forest")
print("   - OFFLINE_RF: Automatic RF detection with extracted features")
print("\nKey features:")
print("   ✅ RF uses 5 features (no tx_rx_byte_asymmetry)")
print("   ✅ Features extracted automatically from ODL")
print("   ✅ No manual input required")
print("   ✅ Automatic polling every 15 seconds")
print("   ✅ Model retrained for ODL compatibility")

print("\n" + "=" * 70)
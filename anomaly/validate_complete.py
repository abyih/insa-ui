#!/usr/bin/env python3
"""
COMPREHENSIVE VALIDATION OF RF INTEGRATION
"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

print("=" * 80)
print("COMPLETE RF INTEGRATION VALIDATION")
print("=" * 80)

# -----------------------------------------------------------------
# 1. VERIFY MODEL COMPATIBILITY
# -----------------------------------------------------------------
print("\n1. MODEL COMPATIBILITY CHECK")
print("-" * 40)

MODEL_PATH = "pretrained_clf_odl.pkl"
MODEL_PATH_OLD = "pretrained_clf.pkl"

# Check new model exists
if os.path.exists(MODEL_PATH):
    print(f"✅ New model found: {MODEL_PATH}")
    try:
        import pickle
        with open(MODEL_PATH, 'rb') as f:
            new_model_data = pickle.load(f)
        
        new_features = new_model_data.get('feature_order', [])
        print(f"   Feature order: {new_features}")
        print(f"   Number of features: {len(new_features)}")
        
        if len(new_features) == 5:
            print("   ✅ Correct: 5 features")
            if "tx_rx_byte_asymmetry" not in new_features:
                print("   ✅ tx_rx_byte_asymmetry NOT present (correct)")
            else:
                print("   ❌ tx_rx_byte_asymmetry still present!")
        else:
            print(f"   ❌ Wrong: Expected 5 features, got {len(new_features)}")
            
    except Exception as e:
        print(f"   ❌ Error loading model: {e}")
else:
    print(f"❌ New model not found: {MODEL_PATH}")

# Check old model (should not be used)
if os.path.exists(MODEL_PATH_OLD):
    print(f"⚠️  Old model still exists: {MODEL_PATH_OLD}")
    print("   Make sure rf_detector.py points to pretrained_clf_odl.pkl")
else:
    print("✅ Old model removed or not present")

# -----------------------------------------------------------------
# 2. VERIFY RF DETECTOR CONFIGURATION
# -----------------------------------------------------------------
print("\n2. RF DETECTOR CONFIGURATION")
print("-" * 40)

rf_detector_path = "rf_detector.py"
if os.path.exists(rf_detector_path):
    with open(rf_detector_path, 'r') as f:
        content = f.read()
    
    # Check which model it loads
    if "pretrained_clf_odl.pkl" in content:
        print("✅ RF detector loads pretrained_clf_odl.pkl")
    elif "pretrained_clf.pkl" in content:
        print("❌ RF detector still loads old pretrained_clf.pkl")
    else:
        print("⚠️  Cannot determine which model RF detector loads")
    
    # Check feature definitions
    if 'FEATURE_KEYS = [' in content:
        start = content.find('FEATURE_KEYS = [')
        end = content.find(']', start) + 1
        feature_section = content[start:end]
        
        if "tx_rx_byte_asymmetry" in feature_section:
            print("❌ tx_rx_byte_asymmetry still in FEATURE_KEYS")
        else:
            print("✅ tx_rx_byte_asymmetry NOT in FEATURE_KEYS")
        
        # Count features
        lines = [l.strip() for l in feature_section.split('\n') if '"' in l]
        print(f"   Number of features in FEATURE_KEYS: {len(lines)}")
else:
    print("❌ RF detector file not found")

# -----------------------------------------------------------------
# 3. VERIFY FEATURE EXTRACTION CODE
# -----------------------------------------------------------------
print("\n3. FEATURE EXTRACTION CODE")
print("-" * 40)

features_path = "features.py"
if os.path.exists(features_path):
    with open(features_path, 'r') as f:
        content = f.read()
    
    # Check PortConnectorExtractor
    if "PortConnectorExtractor" in content:
        print("✅ PortConnectorExtractor class found")
        
        # Check if it creates 5 or 6 features
        if "tx_rx_byte_asymmetry" in content:
            # Count how many times it appears
            count = content.count("tx_rx_byte_asymmetry")
            print(f"⚠️  tx_rx_byte_asymmetry appears {count} times in features.py")
            print("   Should be 0 if completely removed")
        else:
            print("✅ tx_rx_byte_asymmetry NOT in features.py")
        
        # Check feature array creation
        if "np.array([" in content and "avg_pkt_size" in content:
            print("✅ Feature array creation found")
    else:
        print("❌ PortConnectorExtractor class not found")

# -----------------------------------------------------------------
# 4. VERIFY TRAINING vs LIVE FEATURE CALCULATIONS
# -----------------------------------------------------------------
print("\n4. TRAINING vs LIVE FEATURE CALCULATIONS")
print("-" * 40)

print("Training definitions (from retrain_simple.py):")
print("  1. avg_pkt_size = bytecount / (pktcount + EPS)")
print("  2. total_duration_sec = 15.0 (fixed polling interval)")
print("  3. bytes_per_sec = bytecount / 15.0")
print("  4. pktcount = pktcount (raw from dataset)")
print("  5. tx_bytes = tx_bytes (raw from dataset)")

print("\nLive extraction definitions (from features.py):")
print("  1. avg_pkt_size = delta_bytes / delta_packets")
print("  2. total_duration_sec = 15.0 (poll_interval)")
print("  3. bytes_per_sec = delta_bytes / 15.0")
print("  4. pktcount = delta_packets")
print("  5. tx_bytes = delta_tx_bytes")

print("\nKey differences:")
print("  ❌ COUNTER TYPE: Training = raw totals, Live = deltas")
print("  ⚠️  This is a FUNDAMENTAL MISMATCH")
print("  ⚠️  Model trained on raw totals but receives deltas")

# -----------------------------------------------------------------
# 5. VERIFY FRONTEND
# -----------------------------------------------------------------
print("\n5. FRONTEND VERIFICATION")
print("-" * 40)

frontend_path = "../src/Pages/AnomalyDetector/AnomalyDetector.jsx"
if os.path.exists(frontend_path):
    with open(frontend_path, 'r') as f:
        content = f.read()
    
    # Check for manual input
    if "RF Manual Input" in content:
        print("❌ Manual RF input UI still present")
    else:
        print("✅ Manual RF input UI removed")
    
    if "Score Sample" in content:
        print("❌ 'Score Sample' button still present")
    else:
        print("✅ 'Score Sample' button removed")
    
    if "rfInputs" in content or "rfSrc" in content:
        print("❌ Manual RF state variables still present")
    else:
        print("✅ Manual RF state variables removed")
    
    # Check RF feature display
    if "RF_FEATURES" in content:
        print("✅ RF_FEATURES definition found")
        # Count features in display
        rf_features_start = content.find("RF_FEATURES = [")
        if rf_features_start != -1:
            rf_features_end = content.find("]", rf_features_start)
            rf_section = content[rf_features_start:rf_features_end]
            lines = [l for l in rf_section.split('\n') if 'key:' in l]
            print(f"   Number of RF features in UI: {len(lines)}")
            
            # Check for tx_rx_byte_asymmetry
            if any("tx_rx_byte_asymmetry" in l for l in lines):
                print("❌ tx_rx_byte_asymmetry still in UI display")
            else:
                print("✅ tx_rx_byte_asymmetry NOT in UI display")
else:
    print("⚠️  Frontend file not found at expected path")

# -----------------------------------------------------------------
# 6. CRITICAL ISSUES SUMMARY
# -----------------------------------------------------------------
print("\n" + "=" * 80)
print("CRITICAL VALIDATION RESULTS")
print("=" * 80)

print("\n🚨 MAJOR ISSUE FOUND:")
print("The RF model was trained on RAW COUNTS from the dataset,")
print("but the live extraction provides DELTAS (changes per interval).")
print("This is a FUNDAMENTAL MISMATCH that will cause incorrect predictions.")

print("\nRequired fix:")
print("Option A: Retrain model with delta features")
print("   - Transform dataset to calculate deltas between flows")
print("   - Or use time-window aggregation")

print("Option B: Change live extraction to match training")
print("   - Extract raw totals from ODL (not deltas)")
print("   - Requires different ODL statistics collection")

print("\nWithout fixing this, the RF model will produce meaningless results.")
print("The feature values sent to the model DO NOT MATCH what it was trained on.")

# -----------------------------------------------------------------
# 7. RECOMMENDED ACTION PLAN
# -----------------------------------------------------------------
print("\n" + "=" * 80)
print("IMMEDIATE ACTION PLAN")
print("=" * 80)

print("\n1. FIX FEATURE MISMATCH:")
print("   Update retrain_simple.py to calculate DELTA features:")
print("   - Group dataset rows by time intervals")
print("   - Calculate deltas between intervals")
print("   - Retrain model with delta features")

print("\n2. VERIFY AFTER FIX:")
print("   - Model expects 5 features (no tx_rx_byte_asymmetry)")
print("   - Training features = Live extraction features")
print("   - Feature order identical")
print("   - RF detector loads correct model")
print("   - Frontend shows correct features")

print("\n3. END-TO-END TEST:")
print("   - Start both servers (IF + RF)")
print("   - Connect to real ODL")
print("   - Verify automatic feature extraction")
print("   - Verify RF predictions change with traffic")

print("\n" + "=" * 80)
print("CURRENT STATUS: INCOMPLETE - CRITICAL MISMATCH FOUND")
print("=" * 80)
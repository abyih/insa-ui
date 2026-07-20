# Anomaly Detection Modes

## Overview
The system provides two completely separate detection modes with independent feature pipelines, training approaches, and use cases.

## Mode 1: Online Isolation Forest (ONLINE_IF)

### Purpose
- **Real-time SDN traffic anomaly detection**
- Unsupervised learning of normal traffic patterns
- Continuous online operation with adaptive thresholds

### Feature Pipeline
Uses 5 delta features extracted from **OpenDayLight flow table statistics**:
1. `avg_packet_size` - Average packet size in bytes
2. `bytes_per_second` - Throughput rate  
3. `packet_count` - Total packets per interval
4. `active_flow_count` - Number of active flows in table
5. `asymmetry` - TX vs RX byte asymmetry ratio

### Workflow
1. **Baseline Collection** - 100 samples (~25 minutes) of normal traffic
2. **Drift Validation** - Check if baseline represents stable normal traffic
3. **Model Training** - Train Isolation Forest on baseline samples
4. **Online Detection** - Score live traffic against trained model
5. **State Machine** - Reduce false alarms with state transitions
6. **Coordinator** - Aggregate network-wide severity

### Key Characteristics
- ✅ **Unsupervised** - No labeled attack data required
- ✅ **Online Learning** - Continuously adapts to network changes
- ✅ **Real-time** - 30-second polling intervals
- ✅ **Per-switch Isolation** - Independent detection per device
- ✅ **Adaptive Thresholds** - Self-tuning based on traffic patterns

### Use Case
- Production SDN monitoring
- Real-time attack detection
- Network traffic anomaly identification

---

## Mode 2: Offline Random Forest (OFFLINE_RF)

### Purpose
- **Supervised benchmark classification**
- Offline evaluation using historical dataset
- Static model with no online learning

### Feature Pipeline
Uses 6 features from **Kaggle SDN dataset** format:
1. `avg_pkt_size` - Average packet size in bytes
2. `total_duration_sec` - Flow duration in seconds
3. `bytes_per_sec` - Byte rate per second
4. `tx_rx_byte_asymmetry` - TX/RX byte asymmetry
5. `pktcount` - Total packet count
6. `tx_bytes` - Transmitted bytes

### Workflow
1. **Model Loading** - Load pretrained Random Forest from `pretrained_kdd_rf.pkl`
2. **Feature Preprocessing** - log1p transform + RobustScaler
3. **Probability Prediction** - `predict_proba` for attack probability
4. **Zone Classification** - Map probability to attack zones
5. **Flood Override** - Bypass model for obvious flood attacks

### Key Characteristics
- ✅ **Supervised** - Trained on labeled dataset (98.5% accuracy)
- ✅ **Static Model** - No retraining or adaptation
- ✅ **Benchmark** - Provides comparison baseline
- ✅ **Probability Outputs** - Continuous attack probability
- ✅ **Flood Detection** - Special handling for volumetric attacks

### Use Case
- Offline dataset analysis
- Model performance benchmarking
- Supervised classification reference
- Research and evaluation

---

## Architectural Separation

### Feature Independence
- **ONLINE_IF** ↔ **OFFLINE_RF** features are **incompatible**
- No feature mapping or approximation between modes
- Each mode uses its own feature extraction pipeline

### Model Independence  
- **ONLINE_IF**: Isolation Forest (unsupervised, online)
- **OFFLINE_RF**: Random Forest (supervised, offline)
- Different training methodologies and assumptions

### Purpose Separation
- **ONLINE_IF** = Real-time operational detection
- **OFFLINE_RF** = Offline benchmark evaluation

---

## How to Use

### Starting Servers
```bash
# Terminal 1: Online IF Server (port 5001)
cd anomaly && python detector.py

# Terminal 2: Offline RF Server (port 5002)  
cd anomaly && python rf_detector.py
```

### Frontend Mode Selection
- **Online IF**: Polls ODL automatically, shows SDN traffic features
- **Offline RF**: Manual input only, shows RF classification results

### API Endpoints

#### Online IF (port 5001)
```
POST /detect     - { "switch_id": "openflow:1", "raw_odl": {...} }
GET  /health     - Server status
GET  /status     - Per-switch detector status
POST /reset      - Reset detectors
```

#### Offline RF (port 5002)
```
POST /detect     - { "avg_pkt_size": 120, "total_duration_sec": 5, ... }
GET  /health     - RF model status
GET  /status     - RF scoring statistics
POST /reset      - Reset scoring counter
POST /reload     - Reload RF model
```

---

## Scientific Validity

### Key Principle
> **Never claim RF accuracy applies to live ODL traffic**

The RF model was trained on Kaggle dataset features with different:
- Feature definitions and extraction methods
- Data collection methodology
- Time scales and measurement intervals

### Appropriate Comparisons
1. **Within-mode comparisons**: Compare IF performance across different switches
2. **Benchmark comparisons**: Use RF as reference for offline dataset analysis
3. **Methodology comparisons**: Compare unsupervised vs supervised approaches

### Invalid Comparisons
1. ❌ RF accuracy → ODL detection performance
2. ❌ RF features → IF feature performance
3. ❌ RF thresholds → IF operational thresholds

---

## Implementation Notes

### Frontend Behavior
- **ONLINE_IF**: Auto-polling every 30s, multi-switch monitoring
- **OFFLINE_RF**: Manual input only, single-sample classification
- Separate UI sections for each mode's features and results

### Server Architecture
- **ONLINE_IF**: Per-switch detector instances with shared coordinator
- **OFFLINE_RF**: Single model with thread-safe scoring counter
- No shared state or communication between servers

### Data Flow
```
ONLINE_IF: ODL → IF Features → Isolation Forest → State Machine → Coordinator
OFFLINE_RF: User Input → RF Features → Random Forest → Probability Zones
```

### No Cross-Mode Dependencies
- No feature engineering between modes
- No model parameter sharing
- No threshold alignment
- No result aggregation across modes
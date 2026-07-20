# MODULE 2 — FEATURES
# FeatureVector dataclass + FlowTableExtractor + PortConnectorExtractor (stub)

import time
import numpy as np
from dataclasses import dataclass, field
from typing import Optional


@dataclass
class FeatureVector:
    values:       np.ndarray
    timestamp:    float
    switch_id:    str
    source:       str
    is_injected:  bool        = False
    true_label:   Optional[str] = None   # "normal" | "attack" | None


# ── Feature names (must match extractor output order) ────────────────────────
FLOW_TABLE_FEATURES = [
    "avg_packet_size",    # delta_bytes / delta_packets
    "bytes_per_second",   # delta_bytes / poll_interval
    "packet_count",       # delta_packets
    "active_flow_count",  # current flow table size
    "asymmetry",          # placeholder constant = 1.0
]


class FlowTableExtractor:
    """
    Extracts 5 features from ODL flow-table stats for a specific switch.

    Features:
      avg_packet_size   = delta_bytes / delta_packets
      bytes_per_second  = delta_bytes / poll_interval
      packet_count      = delta_packets this interval
      active_flow_count = current number of flows in the table
      asymmetry         = 1.0 (placeholder — ODL flow level has no tx/rx split)

    Snapshot state is owned internally, keyed by switch_id.
    On the first call for a given switch_id all deltas are 0.
    """

    def __init__(self, poll_interval: float = 15.0):
        self.poll_interval = poll_interval
        self._prev: Optional[dict] = None   # { "packets": int, "bytes": int, "flows": int }

    def extract(self, raw_odl: dict, switch_id: str) -> Optional["FeatureVector"]:
        node = self._find_node(raw_odl, switch_id)

        # Node not found — do not corrupt snapshot, skip this poll
        if not node:
            return None

        cur_packets, cur_bytes, cur_flows, avg_duration_sec = self._count(node)

        # ODL returned all-zero stats while we have a previous snapshot — suspicious
        if cur_packets == 0 and cur_bytes == 0 and self._prev is not None:
            return None

        prev      = self._prev or {}
        d_packets = self._delta(cur_packets, prev.get("packets"))
        d_bytes   = self._delta(cur_bytes,   prev.get("bytes"))

        # Only update snapshot when we got real data
        self._prev = {
            "packets": cur_packets,
            "bytes":   cur_bytes,
            "flows":   cur_flows,
            "avg_duration": avg_duration_sec,
        }

        avg_pkt_size  = d_bytes / d_packets if d_packets > 0 else 0.0
        bytes_per_sec = d_bytes / self.poll_interval
        asymmetry     = 1.0

        values = np.array([
            avg_pkt_size,
            bytes_per_sec,
            float(d_packets),
            float(cur_flows),
            asymmetry,
        ], dtype=float)

        return FeatureVector(
            values=values,
            timestamp=time.time(),
            switch_id=switch_id,
            source="flow_table",
        )

    def reset(self) -> None:
        """Clear the stored snapshot."""
        self._prev = None

    def extract_global(self, *args, **kwargs):
        raise NotImplementedError(
            "extract_global() has been removed. "
            "FlowTableExtractor now owns snapshot state internally per switch_id. "
            "Calling extract_global() would produce wrong deltas because it does not "
            "update _snapshots, making any subsequent or interleaved extract() calls "
            "stale. Use extract(raw_odl, switch_id) for each switch individually."
        )

    # ── helpers ───────────────────────────────────────────────────────────────
    @staticmethod
    def _find_node(raw_odl: dict, switch_id: str) -> dict:
        nodes = raw_odl.get("opendaylight-inventory:nodes", {}).get("node", [])
        for n in nodes:
            if n.get("id") == switch_id:
                return n
        return {}

    @staticmethod
    def _count_flows(node: dict):
        """
        Extract per-flow statistics for RF feature compatibility.
        Returns list of flows with: packets, bytes, duration_sec
        """
        flows_data = []
        
        for table in node.get("flow-node-inventory:table", []):
            for flow in table.get("flow", []):
                s = flow.get("opendaylight-flow-statistics:flow-statistics", {})
                packets = int(s.get("packet-count") or s.get("packetCount") or 0)
                bytes_  = int(s.get("byte-count")   or s.get("byteCount")   or 0)
                
                # Extract flow duration
                duration = s.get("duration")
                duration_sec = 0.0
                if duration:
                    seconds = duration.get("second", 0)
                    nanoseconds = duration.get("nanosecond", 0)
                    duration_sec = seconds + (nanoseconds / 1_000_000_000)
                
                # Only include flows with non-zero activity
                if packets > 0 or bytes_ > 0:
                    flows_data.append({
                        "packets": packets,
                        "bytes": bytes_,
                        "duration_sec": duration_sec
                    })
        
        return flows_data
    
    @staticmethod
    def _count(node: dict):
        """Legacy method for IF features (per-time-interval)."""
        packets = 0
        bytes_  = 0
        flows   = 0
        total_duration_sec = 0.0
        flow_count_for_duration = 0
        
        for table in node.get("flow-node-inventory:table", []):
            for flow in table.get("flow", []):
                s = flow.get("opendaylight-flow-statistics:flow-statistics", {})
                packets += int(s.get("packet-count") or s.get("packetCount") or 0)
                bytes_  += int(s.get("byte-count")   or s.get("byteCount")   or 0)
                flows   += 1
                
                duration = s.get("duration")
                if duration:
                    seconds = duration.get("second", 0)
                    nanoseconds = duration.get("nanosecond", 0)
                    duration_sec = seconds + (nanoseconds / 1_000_000_000)
                    total_duration_sec += duration_sec
                    flow_count_for_duration += 1
        
        avg_duration_sec = total_duration_sec / flow_count_for_duration if flow_count_for_duration > 0 else 0.0
        
        return packets, bytes_, flows, avg_duration_sec

    @staticmethod
    def _delta(current: int, previous) -> int:
        if previous is None:
            return 0
        if current < previous:   # counter reset
            return current
        return current - previous


class PortConnectorExtractor:
    """
    Extracts RF features from ODL data for Random Forest model.
    
    RF Features for NEW model (5 features, NO tx_rx_byte_asymmetry):
    1. avg_pkt_size          - Average packet size: delta_bytes / delta_packets
    2. total_duration_sec    - Polling interval (15.0 seconds) - FIXED
    3. bytes_per_sec         - Byte rate: delta_bytes / 15.0
    4. pktcount              - Packet count: delta_packets
    5. tx_bytes              - Transmitted bytes: delta_tx_bytes
    
    NOTE: Waiting for retrained model. Current implementation uses OLD 6-feature model
    with calculated tx_rx_byte_asymmetry for compatibility.
    """

    def __init__(self, poll_interval: float = 15.0):
        self.poll_interval = poll_interval
        self._prev_stats: dict = {}  # switch_id -> {"tx_bytes": int, "rx_bytes": int, "avg_duration": float}
        
    def extract(self, raw_odl: dict, switch_id: str) -> Optional["FeatureVector"]:
        """
        Extract RF features from ODL data automatically.
        
        Combines flow table stats and port connector stats.
        Returns None if data is unavailable.
        """
        # Get flow table statistics
        node = FlowTableExtractor._find_node(raw_odl, switch_id)
        if not node:
            return None
            
        # Extract flow statistics
        cur_packets, cur_bytes, cur_flows, avg_duration_sec = FlowTableExtractor._count(node)
        
        # Get previous stats for delta calculation
        prev = self._prev_stats.get(switch_id, {"packets": 0, "bytes": 0, "tx_bytes": 0, "rx_bytes": 0, "avg_duration": 0.0})
        
        # Calculate deltas
        d_packets = FlowTableExtractor._delta(cur_packets, prev.get("packets"))
        d_bytes = FlowTableExtractor._delta(cur_bytes, prev.get("bytes"))
        
        # Extract port statistics for TX bytes
        port_stats = self._extract_port_stats(node)
        if port_stats is None:
            return None
            
        # Update stored statistics
        self._prev_stats[switch_id] = {
            "packets": cur_packets,
            "bytes": cur_bytes,
            "tx_bytes": port_stats["tx_total"],
            "rx_bytes": port_stats["rx_total"],
            "avg_duration": avg_duration_sec,
        }
        
        # Calculate features
        avg_pkt_size = d_bytes / d_packets if d_packets > 0 else 0.0
        bytes_per_sec = d_bytes / self.poll_interval
        pktcount = float(d_packets)
        tx_bytes = float(port_stats["delta_tx"])
        rx_bytes = float(port_stats["delta_rx"])
        
        # IMPORTANT DECISION: What should total_duration_sec be?
        # Option 1: Polling interval (15s) - matches bytes_per_sec calculation
        # Option 2: Average flow duration from ODL
        # For now, using polling interval to be consistent with bytes_per_sec
        total_duration_sec = self.poll_interval
        
        # Calculate TX/RX asymmetry (match training formula: |tx - rx| / (tx + rx + EPS))
        EPS = 1e-9  # Small epsilon to avoid division by zero
        total_bytes = tx_bytes + rx_bytes + EPS
        tx_rx_byte_asymmetry = abs(tx_bytes - rx_bytes) / total_bytes
        
        # NEW: Using 5 features (tx_rx_byte_asymmetry REMOVED)
        values = np.array([
            avg_pkt_size,           # avg_pkt_size
            total_duration_sec,     # total_duration_sec (polling interval)
            bytes_per_sec,          # bytes_per_sec
            pktcount,               # pktcount
            tx_bytes,               # tx_bytes
        ], dtype=float)
        
        return FeatureVector(
            values=values,
            timestamp=time.time(),
            switch_id=switch_id,
            source="port_connector",
        )
    
    def _extract_port_stats(self, node: dict) -> Optional[dict]:
        """
        Extract TX/RX bytes from node-connector statistics.
        Returns {"tx_total": int, "rx_total": int, "delta_tx": int, "delta_rx": int}
        """
        # Find node-connectors within the node
        connectors = node.get("opendaylight-inventory:node-connector", [])
        
        tx_total = 0
        rx_total = 0
        
        for conn in connectors:
            # Get statistics from each connector
            stats = conn.get("opendaylight-port-statistics:flow-capable-node-connector-statistics", {})
            
            # Different ODL versions use different field names
            tx_bytes = stats.get("bytes", {}).get("transmitted") or stats.get("transmitted", {}).get("bytes") or 0
            rx_bytes = stats.get("bytes", {}).get("received") or stats.get("received", {}).get("bytes") or 0
            
            tx_total += int(tx_bytes)
            rx_total += int(rx_bytes)
        
        # For now, return totals (delta calculation handled at extract level)
        return {
            "tx_total": tx_total,
            "rx_total": rx_total,
            "delta_tx": tx_total,  # Will be converted to delta in extract()
            "delta_rx": rx_total,  # Will be converted to delta in extract()
        }
    
    def reset(self) -> None:
        """Clear stored port statistics."""
        self._prev_stats = {}

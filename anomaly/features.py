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



# ── Multi-class RF feature names (must match train_multiclass.py) ────────
RF_MULTICLASS_FEATURES = [
    "avg_pkt_size",         # delta_bytes / delta_packets
    "bytes_per_sec",        # delta_bytes / poll_interval
    "packets_per_sec",      # delta_packets / poll_interval
    "active_flow_count",    # current flow table size
    "flow_duration",        # average flow duration from ODL stats
    "avg_bytes_per_flow",   # delta_bytes / flow_count
    "tx_rx_byte_ratio",     # tx_bytes / (rx_bytes + eps)
    "packet_size_variance", # variance of per-flow byte counts
]


class PortConnectorExtractor:
    """
    Extracts 8 RF features from ODL data for the multi-class Random Forest model.

    Features (must match train_multiclass.py FEATURES list):
      1. avg_pkt_size          - delta_bytes / delta_packets
      2. bytes_per_sec         - delta_bytes / poll_interval
      3. packets_per_sec       - delta_packets / poll_interval
      4. active_flow_count     - number of flows in the table
      5. flow_duration         - average flow duration from ODL stats (seconds)
      6. avg_bytes_per_flow    - delta_bytes / flow_count
      7. tx_rx_byte_ratio      - tx_bytes / (rx_bytes + eps)
      8. packet_size_variance  - variance of per-flow byte counts
    """

    EPS = 1e-9

    def __init__(self, poll_interval: float = 15.0):
        self.poll_interval = poll_interval
        self._prev_stats: dict = {}  # switch_id -> snapshot

    def extract(self, raw_odl: dict, switch_id: str) -> Optional["FeatureVector"]:
        """
        Extract 8 RF features from ODL data automatically.
        Combines flow table stats and port connector stats.
        Returns None if data is unavailable.
        """
        node = FlowTableExtractor._find_node(raw_odl, switch_id)
        if not node:
            return None

        # Aggregate flow statistics
        cur_packets, cur_bytes, cur_flows, avg_duration_sec = FlowTableExtractor._count(node)

        # Per-flow byte counts for variance calculation
        per_flow_bytes = self._per_flow_byte_counts(node)

        # Previous snapshot for delta calculation
        prev = self._prev_stats.get(switch_id, {
            "packets": 0, "bytes": 0, "tx_bytes": 0, "rx_bytes": 0,
        })

        # Deltas
        d_packets = FlowTableExtractor._delta(cur_packets, prev.get("packets"))
        d_bytes = FlowTableExtractor._delta(cur_bytes, prev.get("bytes"))

        # Port statistics (TX/RX)
        port_stats = self._extract_port_stats(node)
        if port_stats is None:
            return None

        tx_bytes = float(port_stats["tx_total"])
        rx_bytes = float(port_stats["rx_total"])

        # Update snapshot
        self._prev_stats[switch_id] = {
            "packets": cur_packets,
            "bytes": cur_bytes,
            "tx_bytes": port_stats["tx_total"],
            "rx_bytes": port_stats["rx_total"],
        }

        # ── Compute 8 features ────────────────────────────────────────────
        avg_pkt_size = d_bytes / d_packets if d_packets > 0 else 0.0
        bytes_per_sec = d_bytes / self.poll_interval
        packets_per_sec = d_packets / self.poll_interval
        active_flow_count = float(max(cur_flows, 1))
        flow_duration = avg_duration_sec  # seconds from ODL stats
        avg_bytes_per_flow = d_bytes / cur_flows if cur_flows > 0 else 0.0
        tx_rx_byte_ratio = tx_bytes / (rx_bytes + self.EPS)

        # Packet size variance across individual flows
        if len(per_flow_bytes) >= 2:
            packet_size_variance = float(np.var(per_flow_bytes))
        else:
            packet_size_variance = 0.0

        values = np.array([
            avg_pkt_size,
            bytes_per_sec,
            packets_per_sec,
            active_flow_count,
            flow_duration,
            avg_bytes_per_flow,
            tx_rx_byte_ratio,
            packet_size_variance,
        ], dtype=float)

        return FeatureVector(
            values=values,
            timestamp=time.time(),
            switch_id=switch_id,
            source="port_connector",
        )

    # ── helpers ───────────────────────────────────────────────────────────

    @staticmethod
    def _per_flow_byte_counts(node: dict) -> list:
        """Extract per-flow byte counts for variance calculation."""
        counts = []
        for table in node.get("flow-node-inventory:table", []):
            for flow in table.get("flow", []):
                s = flow.get("opendaylight-flow-statistics:flow-statistics", {})
                b = int(s.get("byte-count") or s.get("byteCount") or 0)
                if b > 0:
                    counts.append(b)
        return counts

    def _extract_port_stats(self, node: dict) -> Optional[dict]:
        """
        Extract TX/RX bytes from node-connector statistics.
        Returns {"tx_total": int, "rx_total": int}
        """
        connectors = node.get("opendaylight-inventory:node-connector", [])

        tx_total = 0
        rx_total = 0

        for conn in connectors:
            stats = conn.get(
                "opendaylight-port-statistics:flow-capable-node-connector-statistics", {}
            )
            t = stats.get("bytes", {}).get("transmitted") or stats.get("transmitted", {}).get("bytes") or 0
            r = stats.get("bytes", {}).get("received") or stats.get("received", {}).get("bytes") or 0
            tx_total += int(t)
            rx_total += int(r)

        return {"tx_total": tx_total, "rx_total": rx_total}

    def reset(self) -> None:
        """Clear stored port statistics."""
        self._prev_stats = {}

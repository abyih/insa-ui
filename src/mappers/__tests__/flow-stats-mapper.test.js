import { describe, it, expect } from "vitest";
import { mapFlowStats } from "../flow-stats-mapper";

function makeRaw(flows, nodeId = "openflow:1") {
  return {
    "opendaylight-inventory:nodes": {
      node: [{
        id: nodeId,
        "flow-node-inventory:table": [{ id: 0, flow: flows }],
      }],
    },
  };
}

describe("mapFlowStats", () => {
  it("returns empty array for empty inventory", () => {
    expect(mapFlowStats({ "opendaylight-inventory:nodes": { node: [] } })).toEqual([]);
  });

  it("extracts the 5 required fields", () => {
    const raw = makeRaw([{
      id: "flow-1",
      "opendaylight-flow-statistics:flow-statistics": {
        "packet-count": 42,
        "byte-count":   1024,
        duration: { second: 5, nanosecond: 500 },
      },
    }]);

    const result = mapFlowStats(raw);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      switch_id:    "openflow:1",
      flow_id:      "flow-1",
      packet_count: 42,
      byte_count:   1024,
      duration:     "5s 500ns",
    });
  });

  it("falls back to 0 when stats are missing", () => {
    const raw = makeRaw([{ id: "flow-x" }]);
    const [r] = mapFlowStats(raw);
    expect(r.packet_count).toBe(0);
    expect(r.byte_count).toBe(0);
    expect(r.duration).toBe("0s 0ns");
  });

  it("handles camelCase field names (older ODL versions)", () => {
    const raw = makeRaw([{
      id: "flow-2",
      "opendaylight-flow-statistics:flow-statistics": {
        packetCount: 99,
        byteCount:   512,
        duration: { second: 3, nanosecond: 0 },
      },
    }]);
    const [r] = mapFlowStats(raw);
    expect(r.packet_count).toBe(99);
    expect(r.byte_count).toBe(512);
  });
});

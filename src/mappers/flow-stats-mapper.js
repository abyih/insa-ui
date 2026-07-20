/**
 * Extracts only the essential flow stats from the raw ODL inventory response.
 *
 * Returns a flat array of:
 *   { switch_id, flow_id, packet_count, byte_count, duration }
 */
export function mapFlowStats(rawData) {
  const nodes = rawData?.["opendaylight-inventory:nodes"]?.node || [];
  const result = [];

  nodes.forEach((node) => {
    const switch_id = node.id;

    (node["flow-node-inventory:table"] || []).forEach((table) => {
      (table.flow || []).forEach((flow) => {
        const stats = flow["opendaylight-flow-statistics:flow-statistics"] || {};
        const dur = stats.duration || {};

        result.push({
          switch_id,
          flow_id:      flow.id,
          packet_count: stats["packet-count"] ?? stats.packetCount ?? 0,
          byte_count:   stats["byte-count"]   ?? stats.byteCount   ?? 0,
          duration:     `${dur.second ?? 0}s ${dur.nanosecond ?? 0}ns`,
        });
      });
    });
  });

  return result;
}

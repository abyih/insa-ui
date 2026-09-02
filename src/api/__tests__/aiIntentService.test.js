import { describe, it, expect } from "vitest";
import {
  compileIntentHeuristically,
  compileIntent,
  testAiConnection,
  getAiSettings,
  saveAiSettings,
} from "../aiIntentService";

describe("AI Intent Service (IBN Layer)", () => {
  const mockNetworkContext = {
    onosHosts: [
      {
        id: "00:00:00:00:00:01/-1",
        mac: "00:00:00:00:00:01",
        ipAddresses: ["10.0.0.1"],
        locations: [{ elementId: "of:0000000000000001", port: 1 }],
      },
      {
        id: "00:00:00:00:00:02/-1",
        mac: "00:00:00:00:00:02",
        ipAddresses: ["10.0.0.2"],
        locations: [{ elementId: "of:0000000000000002", port: 1 }],
      },
      {
        id: "00:00:00:00:00:03/-1",
        mac: "00:00:00:00:00:03",
        ipAddresses: ["10.0.0.3"],
        locations: [{ elementId: "of:0000000000000003", port: 1 }],
      },
    ],
    existingSlices: [],
    totalCapacity: 100000,
    remainingCapacity: 100000,
  };

  it("heuristically compiles URLLC intent for autonomous vehicles", () => {
    const prompt = "Create an ultra-reliable low latency URLLC slice for autonomous vehicle telemetry between host 10.0.0.1 and 10.0.0.2 with 20 MB/s bandwidth";
    const result = compileIntentHeuristically(prompt, mockNetworkContext);

    expect(result.sliceType).toBe("urllc");
    expect(result.bandwidth).toBe(20000); // 20 MB/s = 20000 KB/s
    expect(result.targetHostIps).toEqual(["10.0.0.1", "10.0.0.2"]);
    expect(result.admissionStatus).toBe("APPROVED");
    expect(result.openFlowActions.length).toBeGreaterThan(0);
  });

  it("heuristically compiles eMBB intent for 4K video streaming", () => {
    const prompt = "Deploy an eMBB broadband slice for 4K video streaming with 50 MB/s bandwidth limit for all hosts";
    const result = compileIntentHeuristically(prompt, mockNetworkContext);

    expect(result.sliceType).toBe("embb");
    expect(result.bandwidth).toBe(50000);
    expect(result.targetHostIps).toEqual(["10.0.0.1", "10.0.0.2", "10.0.0.3"]);
    expect(result.admissionStatus).toBe("APPROVED");
  });

  it("heuristically compiles mMTC IoT telemetry intent", () => {
    const prompt = "Set up a massive IoT sensor telemetry slice (mMTC) with 1500 KB/s rate limit";
    const result = compileIntentHeuristically(prompt, mockNetworkContext);

    expect(result.sliceType).toBe("mmtc");
    expect(result.bandwidth).toBe(1500);
    expect(result.admissionStatus).toBe("APPROVED");
  });

  it("flags admission rejection when requested bandwidth exceeds remaining capacity", () => {
    const lowCapacityContext = {
      ...mockNetworkContext,
      remainingCapacity: 10000, // only 10 MB/s remaining
    };
    const prompt = "Create broadband slice with 50 MB/s bandwidth";
    const result = compileIntentHeuristically(prompt, lowCapacityContext);

    expect(result.bandwidth).toBe(50000);
    expect(result.admissionStatus).toBe("REJECTED_CAPACITY");
  });

  it("grounds matched hosts in full compileIntent pipeline", async () => {
    const prompt = "Create slice between 10.0.0.1 and 10.0.0.2";
    const result = await compileIntent(
      prompt,
      mockNetworkContext,
      { provider: "heuristic", apiKey: "", model: "rule-based-v1" }
    );

    expect(result.matchedHosts.length).toBe(2);
    expect(result.matchedHosts[0].mac).toBe("00:00:00:00:00:01");
    expect(result.matchedHosts[1].mac).toBe("00:00:00:00:00:02");
    expect(result.admissionStatus).toBe("APPROVED");
  });

  it("tests connection successfully in heuristic mode", async () => {
    const res = await testAiConnection("heuristic", "", "");
    expect(res.success).toBe(true);
  });

  it("compiles intent using local-nlp provider via mock fetch", async () => {
    const originalFetch = global.fetch;
    global.fetch = async (url) => {
      if (url.includes("/health")) {
        return {
          ok: true,
          json: async () => ({ status: "ok", model: "all-MiniLM-L6-v2" }),
        };
      }
      return {
        ok: true,
        json: async () => ({
          sliceName: "Test-Local-Slice",
          sliceType: "urllc",
          description: "Local neural compiled URLLC",
          bandwidth: 15000,
          burstSize: 3000,
          unit: "KB_PER_SEC",
          color: "#ef4444",
          vlanId: null,
          targetHostIps: ["10.0.0.1"],
          confidence: 0.94,
          reasoning: "Semantically matched to URLLC",
          admissionStatus: "APPROVED",
          openFlowActions: ["Priority 40000 flow rule"],
        }),
      };
    };

    try {
      const connTest = await testAiConnection("local-nlp", "", "all-MiniLM-L6-v2");
      expect(connTest.success).toBe(true);

      const result = await compileIntent(
        "Low latency drone control for 10.0.0.1",
        mockNetworkContext,
        { provider: "local-nlp", apiKey: "", model: "all-MiniLM-L6-v2" }
      );

      expect(result.sliceType).toBe("urllc");
      expect(result.bandwidth).toBe(15000);
      expect(result.targetHostIps).toEqual(["10.0.0.1"]);
      expect(result.provider).toBe("local-nlp (all-MiniLM-L6-v2)");
    } finally {
      global.fetch = originalFetch;
    }
  });
});

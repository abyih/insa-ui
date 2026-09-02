import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createSlice,
  deleteSlice,
  loadSlices,
  saveSlices,
  isHostInAnySlice,
  getTopologyInfo,
} from "../slicingService";
import * as apiController from "../api-controller";

vi.mock("../api-controller", () => ({
  getMeters: vi.fn().mockResolvedValue([]),
  createMeter: vi.fn().mockResolvedValue({ id: "1" }),
  deleteMeter: vi.fn().mockResolvedValue({ success: true }),
  getDevices: vi.fn().mockResolvedValue([
    { id: "of:0000000000000001", available: true, annotations: { datapathDescription: "s1" } },
    { id: "of:0000000000000002", available: true, annotations: { datapathDescription: "s2" } },
    { id: "of:0000000000000003", available: true, annotations: { datapathDescription: "s3" } },
  ]),
  getLinks: vi.fn().mockResolvedValue([
    { src: { device: "of:0000000000000001", port: "1" }, dst: { device: "of:0000000000000002", port: "3" } },
    { src: { device: "of:0000000000000001", port: "2" }, dst: { device: "of:0000000000000003", port: "3" } },
  ]),
  getHosts: vi.fn().mockResolvedValue([]),
  installOnosFlow: vi.fn().mockResolvedValue({ id: "flow-101", flowId: "flow-101" }),
  deleteOnosFlow: vi.fn().mockResolvedValue({ success: true }),
  getOnosFlows: vi.fn().mockImplementation((deviceId) => {
    return Promise.resolve([
      {
        id: "flow-101",
        priority: 40000,
        selector: {
          criteria: [
            { type: "ETH_SRC", mac: "00:00:00:00:00:02" },
            { type: "ETH_DST", mac: "00:00:00:00:00:03" },
          ],
        },
      },
      {
        id: "flow-102",
        priority: 39000,
        selector: {
          criteria: [{ type: "ETH_SRC", mac: "00:00:00:00:00:02" }],
        },
      },
      {
        id: "other-flow",
        priority: 10,
        selector: {
          criteria: [{ type: "ETH_SRC", mac: "00:00:00:00:00:99" }],
        },
      },
    ]);
  }),
}));

const localStorageMock = (() => {
  let store = {};
  return {
    getItem: (key) => store[key] || null,
    setItem: (key, value) => {
      store[key] = value.toString();
    },
    removeItem: (key) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();

Object.defineProperty(globalThis, "localStorage", {
  value: localStorageMock,
  writable: true,
});

describe("Slicing Service - Slice Deletion & Deep Flow Cleanup", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it("successfully deletes a slice and invokes deep flow cleanup across switches", async () => {
    const testSlice = {
      id: "slice-test-1",
      name: "Test Slice",
      bandwidth: 5000,
      vlanId: 100,
      hosts: [
        {
          mac: "00:00:00:00:00:02",
          ipAddresses: ["10.0.0.2"],
          deviceId: "of:0000000000000001",
          port: "1",
          meterId: "1",
          dropFlowId: "drop-1",
        },
        {
          mac: "00:00:00:00:00:03",
          ipAddresses: ["10.0.0.3"],
          deviceId: "of:0000000000000002",
          port: "1",
          meterId: "2",
          dropFlowId: "drop-2",
        },
      ],
      flows: [
        { deviceId: "of:0000000000000001", flowId: "flow-tracked-1" },
        { deviceId: "of:0000000000000002", flowId: "flow-tracked-2" },
      ],
    };

    saveSlices([testSlice]);
    expect(loadSlices().length).toBe(1);
    expect(isHostInAnySlice("00:00:00:00:00:02")).toBeTruthy();

    const result = await deleteSlice("slice-test-1");
    expect(result.success).toBe(true);

    // Tracked flows deleted
    expect(apiController.deleteOnosFlow).toHaveBeenCalledWith("of:0000000000000001", "flow-tracked-1");
    expect(apiController.deleteOnosFlow).toHaveBeenCalledWith("of:0000000000000002", "flow-tracked-2");

    // Drop flows deleted
    expect(apiController.deleteOnosFlow).toHaveBeenCalledWith("of:0000000000000001", "drop-1");
    expect(apiController.deleteOnosFlow).toHaveBeenCalledWith("of:0000000000000002", "drop-2");

    // Meters deleted
    expect(apiController.deleteMeter).toHaveBeenCalledWith("of:0000000000000001", "1");
    expect(apiController.deleteMeter).toHaveBeenCalledWith("of:0000000000000002", "2");

    // Deep clean flows deleted (flow-101 and flow-102 matching the slice hosts)
    expect(apiController.deleteOnosFlow).toHaveBeenCalledWith("of:0000000000000001", "flow-101");
    expect(apiController.deleteOnosFlow).toHaveBeenCalledWith("of:0000000000000001", "flow-102");

    // Other non-slice flow (priority 10, other MAC) must NOT be deleted
    expect(apiController.deleteOnosFlow).not.toHaveBeenCalledWith("of:0000000000000001", "other-flow");

    // Slice removed from storage
    expect(loadSlices().length).toBe(0);
    expect(isHostInAnySlice("00:00:00:00:00:02")).toBeNull();
  });
});

describe("Slicing Service - Topology Info & Multi-Slice Host Discovery", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it("discovers all leaf switch hosts when 0 slices exist and ONOS has 0 live hosts", async () => {
    apiController.getHosts.mockResolvedValueOnce([]);

    const topo = await getTopologyInfo();
    expect(topo.devices.length).toBe(3);
    // Leaf switches s2 and s3 yield 4 hosts: h1, h2 on s2; h3, h4 on s3
    expect(topo.hosts.length).toBe(4);
    expect(topo.hosts.map((h) => h.mac)).toEqual([
      "00:00:00:00:00:01",
      "00:00:00:00:00:02",
      "00:00:00:00:00:03",
      "00:00:00:00:00:04",
    ]);
  });

  it("retains undiscovered leaf hosts (h3, h4) when ONOS only returns live hosts for Slice 1 (h1, h2)", async () => {
    // ONOS only knows about h1 and h2 (because Slice 1 was created and only h1/h2 communicated)
    apiController.getHosts.mockResolvedValueOnce([
      {
        id: "00:00:00:00:00:01/None",
        mac: "00:00:00:00:00:01",
        ipAddresses: ["10.0.0.1"],
        locations: [{ elementId: "of:0000000000000002", port: "1" }],
      },
      {
        id: "00:00:00:00:00:02/None",
        mac: "00:00:00:00:00:02",
        ipAddresses: ["10.0.0.2"],
        locations: [{ elementId: "of:0000000000000002", port: "2" }],
      },
    ]);

    // Slice 1 is saved with h1 and h2
    saveSlices([
      {
        id: "slice-1",
        name: "Broadband Slice",
        bandwidth: 10000,
        vlanId: 100,
        hosts: [
          { mac: "00:00:00:00:00:01", ipAddresses: ["10.0.0.1"], deviceId: "of:0000000000000002", port: "1" },
          { mac: "00:00:00:00:00:02", ipAddresses: ["10.0.0.2"], deviceId: "of:0000000000000002", port: "2" },
        ],
      },
    ]);

    const topo = await getTopologyInfo();

    // Must still return all 4 hosts so that h3 and h4 remain visible and selectable for Slice 2!
    expect(topo.hosts.length).toBe(4);
    const hostMacs = topo.hosts.map((h) => h.mac.toLowerCase());
    expect(hostMacs).toContain("00:00:00:00:00:01");
    expect(hostMacs).toContain("00:00:00:00:00:02");
    expect(hostMacs).toContain("00:00:00:00:00:03");
    expect(hostMacs).toContain("00:00:00:00:00:04");

    // Check slice membership distinction
    expect(isHostInAnySlice("00:00:00:00:00:01")?.name).toBe("Broadband Slice");
    expect(isHostInAnySlice("00:00:00:00:00:02")?.name).toBe("Broadband Slice");
    expect(isHostInAnySlice("00:00:00:00:00:03")).toBeNull();
    expect(isHostInAnySlice("00:00:00:00:00:04")).toBeNull();
  });

  it("filters out inter-switch trunk ports when resolving host locations", async () => {
    const sampleLinks = [
      { src: { device: "of:0000000000000001", port: "1" }, dst: { device: "of:0000000000000002", port: "3" } },
      { src: { device: "of:0000000000000001", port: "2" }, dst: { device: "of:0000000000000003", port: "3" } },
    ];

    // Host h1 reported with locations containing both trunk port (s3:3) and true edge port (s2:1)
    const hostWithTrunk = {
      mac: "00:00:00:00:00:01",
      locations: [
        { elementId: "of:0000000000000003", port: "3" }, // Trunk port
        { elementId: "of:0000000000000002", port: "1" }, // Real edge port
      ],
    };

    const loc = apiController ? await import("../slicingService").then((m) => m.getHostLocation(hostWithTrunk, sampleLinks)) : null;
    expect(loc).toEqual({
      deviceId: "of:0000000000000002",
      port: "1",
    });
  });

  it("installs Priority 41000 DSCP 46 flow rule with Queue 0 for URLLC slices", async () => {
    const urllcConfig = {
      name: "Autonomous Vehicles URLLC",
      type: "low-latency",
      template: "urllc",
      bandwidth: 60000,
      burstSize: 10000,
      hosts: [
        { mac: "00:00:00:00:00:01", ip: "10.0.0.1", deviceId: "of:0000000000000002", port: "1" },
        { mac: "00:00:00:00:00:02", ip: "10.0.0.2", deviceId: "of:0000000000000002", port: "2" },
      ],
    };

    const result = await createSlice(urllcConfig);
    expect(result.status).toBe("ACTIVE");

    // Verify installOnosFlow was called with a flow having Priority 41000, IP_DSCP: 46, and QUEUE: 0
    const flowCalls = apiController.installOnosFlow.mock.calls;
    const dscpFlow = flowCalls.find((call) => {
      const flow = call[1];
      const hasDscpCriterion = flow.selector?.criteria?.some(
        (c) => c.type === "IP_DSCP" && c.ipDscp === 46
      );
      const hasQueueInstruction = flow.treatment?.instructions?.some(
        (inst) => inst.type === "QUEUE" && inst.queueId === 0
      );
      return flow.priority === 41000 && hasDscpCriterion && hasQueueInstruction;
    });

    expect(dscpFlow).toBeDefined();
    expect(dscpFlow[0]).toBe("of:0000000000000002");
  });
});

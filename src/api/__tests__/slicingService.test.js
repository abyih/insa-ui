import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  deleteSlice,
  loadSlices,
  saveSlices,
  isHostInAnySlice,
} from "../slicingService";
import * as apiController from "../api-controller";

vi.mock("../api-controller", () => ({
  getMeters: vi.fn().mockResolvedValue([]),
  createMeter: vi.fn().mockResolvedValue({ id: "1" }),
  deleteMeter: vi.fn().mockResolvedValue({ success: true }),
  getDevices: vi.fn().mockResolvedValue([{ id: "of:0000000000000001" }, { id: "of:0000000000000002" }]),
  getLinks: vi.fn().mockResolvedValue([]),
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

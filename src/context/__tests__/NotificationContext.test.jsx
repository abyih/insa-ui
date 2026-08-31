// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { NotificationProvider, useNotifications } from "../NotificationContext";

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

describe("Notification Service & Context", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it("adds and manages SLA burst alerts correctly", () => {
    const wrapper = ({ children }) => <NotificationProvider>{children}</NotificationProvider>;
    const { result } = renderHook(() => useNotifications(), { wrapper });

    expect(result.current.notifications.length).toBe(0);
    expect(result.current.unreadCount).toBe(0);

    // 1. Add a SLA burst violation notification
    let alertId;
    act(() => {
      alertId = result.current.addNotification({
        type: "BURST_VIOLATION",
        title: "SLA Burst Violation",
        message: "Slice 'URLLC-Slice' exceeded 5,000 KB/s rate limit on Switch s2.",
        sliceId: "slice-1",
        sliceName: "URLLC-Slice",
        droppedPackets: 150,
      });
    });

    expect(result.current.notifications.length).toBe(1);
    expect(result.current.unreadCount).toBe(1);
    expect(result.current.burstViolations.length).toBe(1);
    expect(result.current.notifications[0].title).toBe("SLA Burst Violation");

    // 2. Mark as read
    act(() => {
      result.current.markAsRead(alertId);
    });

    expect(result.current.unreadCount).toBe(0);
    expect(result.current.notifications[0].read).toBe(true);

    // 3. Clear all
    act(() => {
      result.current.clearAll();
    });

    expect(result.current.notifications.length).toBe(0);
  });
});

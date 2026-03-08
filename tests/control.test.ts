import { afterEach, describe, expect, it, vi } from "vitest";

import { CowayClient } from "../src/client.js";
import type { DeviceAttributes } from "../src/devices/models.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("control validation", () => {
  it("fails before any network call when required device identifiers are missing", async () => {
    const client = new CowayClient("user@example.com", "s3cret");
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("fetch should not be called"));
    const invalidDeviceAttr: DeviceAttributes = {
      deviceId: null,
      model: null,
      modelCode: null,
      code: null,
      name: "Living Room",
      productName: null,
      placeId: "place-001",
    };

    await expect(client.asyncSetPower(invalidDeviceAttr, true)).rejects.toThrow(
      /DeviceAttributes\.deviceId and DeviceAttributes\.placeId are required/,
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

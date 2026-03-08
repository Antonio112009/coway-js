import { describe, expect, it, vi } from "vitest";

import { CowayClient } from "../src/client.js";
import type {
  FilterSupply,
  PurifierDeviceSummary,
  PurifierTimerInfo,
  UserDeviceInfo,
} from "../src/devices/models.js";
import type { JsonObject } from "../src/types.js";
import {
  sampleControlResponse,
  sampleAirHomeResponse,
  sampleUserDevice,
} from "./fixtures.js";

function deferred<T>() {
  let resolve!: (value: T) => void;

  return {
    promise: new Promise<T>((fulfill) => {
      resolve = fulfill;
    }),
    resolve,
  };
}

describe("asyncGetPurifiersData", () => {
  it("starts control, air, filter, and timer requests in parallel for each purifier", async () => {
    const client = new CowayClient("user@example.com", "s3cret");
    const device: PurifierDeviceSummary = {
      categoryName: "청정기",
      deviceSerial: "ABC123",
      dvcNick: "Living Room",
      modelCode: "AIRMEGA-250S",
      placeId: "place-001",
      productModel: "AIRMEGA-250S",
    };
    const calls: string[] = [];
    const controlRequest = deferred<JsonObject>();
    const airRequest = deferred<JsonObject>();
    const filterRequest = deferred<FilterSupply[]>();
    const timerRequest = deferred<PurifierTimerInfo>();

    const userDeviceMap = new Map<string, UserDeviceInfo>();
    userDeviceMap.set("ABC123", sampleUserDevice());

    vi.spyOn(client as never, "asyncGetPurifiers" as never).mockResolvedValue([
      device,
    ] as never);
    vi.spyOn(
      client as never,
      "asyncServerMaintenanceNotice" as never,
    ).mockResolvedValue(undefined as never);
    vi.spyOn(
      client as never,
      "asyncFetchUserDeviceMap" as never,
    ).mockResolvedValue(userDeviceMap as never);
    vi.spyOn(
      client as never,
      "asyncFetchControlStatus" as never,
    ).mockImplementation(async () => {
      calls.push("control");
      return controlRequest.promise as never;
    });
    vi.spyOn(
      client as never,
      "asyncFetchAirHome" as never,
    ).mockImplementation(async () => {
      calls.push("air");
      return airRequest.promise as never;
    });
    vi.spyOn(
      client as never,
      "asyncFetchFilterStatus" as never,
    ).mockImplementation(async () => {
      calls.push("filter");
      return filterRequest.promise as never;
    });
    vi.spyOn(client as never, "asyncFetchTimer" as never).mockImplementation(
      async () => {
        calls.push("timer");
        return timerRequest.promise as never;
      },
    );

    (client as unknown as { places: { placeId: string; deviceCnt: number }[] }).places = [
      { placeId: "place-001", deviceCnt: 1 },
    ];

    const pending = client.asyncGetPurifiersData();

    // Need enough ticks for asyncFetchUserDeviceMap to resolve,
    // then the per-device parallel calls to start
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(calls).toEqual(["control", "air", "filter", "timer"]);

    controlRequest.resolve(sampleControlResponse());
    airRequest.resolve(sampleAirHomeResponse());
    filterRequest.resolve([]);
    timerRequest.resolve({ offTimer: null });

    const result = await pending;
    expect(result.purifiers.ABC123?.deviceAttr.name).toBe("Living Room");
    expect(result.purifiers.ABC123?.isOn).toBe(true);
    expect(result.purifiers.ABC123?.particulateMatter2_5).toBe(15);
  });
});

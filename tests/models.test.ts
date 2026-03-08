/** Tests for device model interfaces. */

import { describe, it, expect } from "vitest";
import type {
  CowayPurifier,
  DeviceAttributes,
  FilterInfo,
  PurifierData,
} from "../src/devices/models.js";

describe("FilterInfo", () => {
  it("supports all fields", () => {
    const f: FilterInfo = {
      name: "Pre-Filter",
      filterRemain: 80,
      filterRemainStatus: "AVAILABLE",
      replaceCycle: 2,
      replaceCycleUnit: "W",
      lastDate: "2026-01-01",
      nextDate: "2026-01-15",
      pollutants: ["Pollen", "Large dust"],
      description: "Removes large dust and pollen",
      preFilter: true,
      serverReset: true,
    };
    expect(f.name).toBe("Pre-Filter");
    expect(f.filterRemain).toBe(80);
    expect(f.filterRemainStatus).toBe("AVAILABLE");
    expect(f.replaceCycle).toBe(2);
    expect(f.replaceCycleUnit).toBe("W");
    expect(f.lastDate).toBe("2026-01-01");
    expect(f.nextDate).toBe("2026-01-15");
    expect(f.pollutants).toEqual(["Pollen", "Large dust"]);
    expect(f.description).toBe("Removes large dust and pollen");
    expect(f.preFilter).toBe(true);
    expect(f.serverReset).toBe(true);
  });

  it("supports minimal/null fields", () => {
    const f: FilterInfo = {
      name: null,
      filterRemain: null,
      filterRemainStatus: null,
      replaceCycle: null,
      replaceCycleUnit: null,
      lastDate: null,
      nextDate: null,
      pollutants: [],
      description: null,
      preFilter: false,
      serverReset: false,
    };
    expect(f.name).toBeNull();
    expect(f.filterRemain).toBeNull();
    expect(f.pollutants).toEqual([]);
    expect(f.preFilter).toBe(false);
  });

  it("deep-equals identical objects", () => {
    const kwargs: FilterInfo = {
      name: "Max2 Filter",
      filterRemain: 43,
      filterRemainStatus: "AVAILABLE",
      replaceCycle: 12,
      replaceCycleUnit: "M",
      lastDate: null,
      nextDate: null,
      pollutants: ["VOCs"],
      description: null,
      preFilter: false,
      serverReset: false,
    };
    expect(kwargs).toEqual({ ...kwargs });
  });
});

describe("DeviceAttributes", () => {
  it("supports all fields", () => {
    const attr: DeviceAttributes = {
      deviceId: "D1",
      model: "AIRMEGA 250S",
      modelCode: "MC-250S",
      code: "C250",
      name: "Living Room",
      productName: "Airmega 250S",
      placeId: "P1",
    };
    expect(attr.deviceId).toBe("D1");
    expect(attr.model).toBe("AIRMEGA 250S");
    expect(attr.modelCode).toBe("MC-250S");
    expect(attr.code).toBe("C250");
    expect(attr.name).toBe("Living Room");
    expect(attr.productName).toBe("Airmega 250S");
    expect(attr.placeId).toBe("P1");
  });

  it("supports null fields", () => {
    const attr: DeviceAttributes = {
      deviceId: null,
      model: null,
      modelCode: null,
      code: null,
      name: null,
      productName: null,
      placeId: null,
    };
    expect(attr.deviceId).toBeNull();
    expect(attr.name).toBeNull();
  });

  it("deep-equals identical objects", () => {
    const a: DeviceAttributes = {
      deviceId: "D1",
      model: "M",
      modelCode: "MC",
      code: "C",
      name: "N",
      productName: "P",
      placeId: "PL",
    };
    const b = { ...a };
    expect(a).toEqual(b);
  });
});

describe("CowayPurifier", () => {
  it("constructs with all fields", () => {
    const attr: DeviceAttributes = {
      deviceId: "D1",
      model: "M",
      modelCode: "MC",
      code: "C",
      name: "N",
      productName: "P",
      placeId: "PL",
    };
    const purifier: CowayPurifier = {
      deviceAttr: attr,
      mcuVersion: "2.0.1",
      networkStatus: true,
      isOn: true,
      autoMode: true,
      ecoMode: false,
      nightMode: false,
      rapidMode: false,
      fanSpeed: 2,
      lightOn: true,
      lightMode: 2,
      buttonLock: 0,
      timer: null,
      timerRemaining: null,
      preFilterPct: 80,
      max2Pct: 65,
      odorFilterPct: null,
      aqGrade: 1,
      particulateMatter2_5: 15,
      particulateMatter10: 25,
      carbonDioxide: 450,
      volatileOrganicCompounds: 10,
      airQualityIndex: 50,
      luxSensor: 300,
      preFilterChangeFrequency: 112,
      smartModeSensitivity: 3,
      filters: null,
    };
    expect(purifier.isOn).toBe(true);
    expect(purifier.fanSpeed).toBe(2);
    expect(purifier.deviceAttr.deviceId).toBe("D1");
    expect(purifier.preFilterPct).toBe(80);
  });
});

describe("PurifierData", () => {
  it("holds purifiers dict", () => {
    const attr: DeviceAttributes = {
      deviceId: "D1",
      model: "M",
      modelCode: "MC",
      code: "C",
      name: "N",
      productName: "P",
      placeId: "PL",
    };
    const purifier: CowayPurifier = {
      deviceAttr: attr,
      mcuVersion: null,
      networkStatus: null,
      isOn: null,
      autoMode: null,
      ecoMode: null,
      nightMode: null,
      rapidMode: null,
      fanSpeed: null,
      lightOn: null,
      lightMode: null,
      buttonLock: null,
      timer: null,
      timerRemaining: null,
      preFilterPct: null,
      max2Pct: null,
      odorFilterPct: null,
      aqGrade: null,
      particulateMatter2_5: null,
      particulateMatter10: null,
      carbonDioxide: null,
      volatileOrganicCompounds: null,
      airQualityIndex: null,
      luxSensor: null,
      preFilterChangeFrequency: null,
      smartModeSensitivity: null,
      filters: null,
    };
    const data: PurifierData = { purifiers: { D1: purifier } };
    expect("D1" in data.purifiers).toBe(true);
    expect(data.purifiers.D1.deviceAttr.deviceId).toBe("D1");
  });
});

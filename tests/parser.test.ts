/** Tests for devices/parser.ts */

import { describe, it, expect } from "vitest";
import {
  parsePurifierHtml,
  extractParsedInfo,
  extractHtmlSupplements,
  buildFilterDict,
  buildFilterInfoList,
  buildPurifier,
  parseControlStatus,
  parseAirHome,
  buildParsedInfoFromJson,
} from "../src/devices/parser.js";
import { CowayError } from "../src/errors.js";
import {
  sampleDevice,
  sampleParsedInfo,
  samplePurifierJsonChildren,
  sampleControlResponse,
  sampleAirHomeResponse,
  sampleUserDevice,
} from "./fixtures.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function wrapHtml(jsonData: Record<string, any>): string {
  const raw = JSON.stringify(jsonData);
  return `<html><body><script>var sensorInfo = ${raw};</script></body></html>`;
}

// ── parsePurifierHtml ──────────────────────────────────────────

describe("parsePurifierHtml", () => {
  it("returns first dict child", () => {
    const html = wrapHtml(samplePurifierJsonChildren());
    const result = parsePurifierHtml(html);
    expect(result).not.toBeNull();
    expect(result).toHaveProperty("coreData");
  });

  it("returns null when no children key", () => {
    const html = wrapHtml({ other_key: "value" });
    const result = parsePurifierHtml(html);
    expect(result).toBeNull();
  });

  it("throws on invalid html without script tag", () => {
    expect(() => parsePurifierHtml("<html><body></body></html>")).toThrow(
      CowayError,
    );
    expect(() => parsePurifierHtml("<html><body></body></html>")).toThrow(
      /Failed to parse/,
    );
  });

  it("returns null for non-dict children", () => {
    const html = wrapHtml({ children: ["string_child", 123] });
    const result = parsePurifierHtml(html);
    expect(result).toBeNull();
  });
});

// ── extractParsedInfo ──────────────────────────────────────────

describe("extractParsedInfo", () => {
  it("extracts mcu info", () => {
    const child = samplePurifierJsonChildren().children[0];
    const parsed = extractParsedInfo(child);
    expect(parsed.mcuInfo.currentMcuVer).toBe("2.0.1");
  });

  it("extracts sensor info", () => {
    const child = samplePurifierJsonChildren().children[0];
    const parsed = extractParsedInfo(child);
    expect(parsed.sensorInfo["0001"]).toBe(15);
  });

  it("extracts status info", () => {
    const child = samplePurifierJsonChildren().children[0];
    const parsed = extractParsedInfo(child);
    expect(parsed.statusInfo["0001"]).toBe(1);
  });

  it("extracts device info", () => {
    const child = samplePurifierJsonChildren().children[0];
    const parsed = extractParsedInfo(child);
    expect(parsed.deviceInfo.productName).toBe("AIRMEGA 250S");
  });

  it("extracts network and aq grade", () => {
    const child = samplePurifierJsonChildren().children[0];
    const parsed = extractParsedInfo(child);
    expect(parsed.networkInfo.wifiConnected).toBe(true);
    expect(parsed.aqGrade?.iaqGrade).toBe(1);
  });

  it("defaults for empty input", () => {
    const parsed = extractParsedInfo({});
    expect(parsed.deviceInfo).toEqual({});
    expect(parsed.mcuInfo).toEqual({});
    expect(parsed.sensorInfo).toEqual({});
    expect(parsed.statusInfo).toEqual({});
    expect(parsed.timerInfo).toBeNull();
  });
});

// ── extractHtmlSupplements ─────────────────────────────────────

describe("extractHtmlSupplements", () => {
  it("extracts MCU version and lux sensor", () => {
    const purifierInfo = samplePurifierJsonChildren().children[0];
    const result = extractHtmlSupplements(purifierInfo);
    expect(result.mcuVersion).toBe("2.0.1");
    expect(result.lux).toBe(300);
  });

  it("returns null for empty input", () => {
    const result = extractHtmlSupplements({});
    expect(result.mcuVersion).toBeNull();
    expect(result.lux).toBeNull();
  });
});

// ── buildFilterDict ────────────────────────────────────────────

describe("buildFilterDict", () => {
  it("keys pre-filter correctly", () => {
    const filters = [{ supplyNm: "Pre-Filter", filterRemain: 80 }];
    const result = buildFilterDict(filters);
    expect(result["pre-filter"]).toBeDefined();
    expect(result["pre-filter"].filterRemain).toBe(80);
  });

  it("keys max2 filter correctly", () => {
    const filters = [{ supplyNm: "MAX2 Filter", filterRemain: 50 }];
    const result = buildFilterDict(filters);
    expect(result.max2).toBeDefined();
  });

  it("keys both filters", () => {
    const filters = [
      { supplyNm: "Pre-Filter", filterRemain: 80 },
      { supplyNm: "MAX2 Filter", filterRemain: 50 },
    ];
    const result = buildFilterDict(filters);
    expect(result["pre-filter"]).toBeDefined();
    expect(result.max2).toBeDefined();
  });

  it("returns empty for empty list", () => {
    expect(buildFilterDict([])).toEqual({});
  });

  it("keys odor filter without overwriting max2", () => {
    const filters = [
      { supplyNm: "MAX2 Filter", filterRemain: 50 },
      { supplyNm: "Deodorization Filter", filterRemain: 40 },
    ];
    const result = buildFilterDict(filters);
    expect(result.max2.filterRemain).toBe(50);
    expect(result["odor-filter"].filterRemain).toBe(40);
  });
});

// ── buildFilterInfoList ────────────────────────────────────────

describe("buildFilterInfoList", () => {
  it("builds from raw supplies", () => {
    const raw = [
      {
        supplyNm: "Pre-Filter",
        filterRemain: 0,
        filterRemainStatus: "INITIAL",
        replaceCycle: 2,
        replaceCycleUnit: "W",
        lastDate: "",
        nextDate: "",
        preFilterYn: "Y",
        serverResetFilterYn: "Y",
        supplyContent: "<div>Removes dust</div>",
        pollutions: [
          { pollutionNm: "Pollen" },
          { pollutionNm: "Large dust" },
        ],
      },
      {
        supplyNm: "Max2 Filter",
        filterRemain: 43,
        filterRemainStatus: "AVAILABLE",
        replaceCycle: 12,
        replaceCycleUnit: "M",
        lastDate: "",
        nextDate: "",
        preFilterYn: "N",
        serverResetFilterYn: "N",
        supplyContent: "",
        pollutions: [{ pollutionNm: "VOCs" }],
      },
    ];
    const result = buildFilterInfoList(raw);
    expect(result).toHaveLength(2);

    const pre = result[0];
    expect(pre.name).toBe("Pre-Filter");
    expect(pre.filterRemain).toBe(0);
    expect(pre.filterRemainStatus).toBe("INITIAL");
    expect(pre.replaceCycle).toBe(2);
    expect(pre.replaceCycleUnit).toBe("W");
    expect(pre.lastDate).toBeNull(); // empty string → null
    expect(pre.preFilter).toBe(true);
    expect(pre.serverReset).toBe(true);
    expect(pre.description).toBe("Removes dust");
    expect(pre.pollutants).toEqual(["Pollen", "Large dust"]);

    const m2 = result[1];
    expect(m2.name).toBe("Max2 Filter");
    expect(m2.filterRemain).toBe(43);
    expect(m2.replaceCycle).toBe(12);
    expect(m2.replaceCycleUnit).toBe("M");
    expect(m2.preFilter).toBe(false);
    expect(m2.serverReset).toBe(false);
    expect(m2.pollutants).toEqual(["VOCs"]);
  });

  it("returns empty for empty list", () => {
    expect(buildFilterInfoList([])).toEqual([]);
  });
});

// ── buildPurifier ──────────────────────────────────────────────

describe("buildPurifier", () => {
  it("basic build", () => {
    const purifier = buildPurifier(sampleDevice(), sampleParsedInfo());

    expect(purifier.deviceAttr.deviceId).toBe("ABC123");
    expect(purifier.deviceAttr.model).toBe("AIRMEGA 250S");
    expect(purifier.deviceAttr.modelCode).toBe("AIRMEGA-250S");
    expect(purifier.deviceAttr.name).toBe("Living Room");
    expect(purifier.deviceAttr.placeId).toBe("place-001");

    expect(purifier.isOn).toBe(true);
    expect(purifier.autoMode).toBe(true);
    expect(purifier.fanSpeed).toBe(2);
    expect(purifier.lightOn).toBe(true);
    expect(purifier.lightMode).toBe(2);
    expect(purifier.mcuVersion).toBe("2.0.1");
    expect(purifier.networkStatus).toBe(true);
  });

  it("filter values", () => {
    const purifier = buildPurifier(sampleDevice(), sampleParsedInfo());
    expect(purifier.preFilterPct).toBe(80);
    expect(purifier.max2Pct).toBe(65);
    expect(purifier.odorFilterPct).toBe(60); // 100 - 40
    expect(purifier.preFilterChangeFrequency).toBe(112);
  });

  it("air quality values", () => {
    const purifier = buildPurifier(sampleDevice(), sampleParsedInfo());
    expect(purifier.particulateMatter2_5).toBe(15);
    expect(purifier.particulateMatter10).toBe(25);
    expect(purifier.carbonDioxide).toBe(450);
    expect(purifier.volatileOrganicCompounds).toBe(10);
    expect(purifier.airQualityIndex).toBe(50);
    expect(purifier.aqGrade).toBe(1);
  });

  it("falls back to sensor info when no filters", () => {
    const info = sampleParsedInfo();
    info.filterInfo = {};
    const purifier = buildPurifier(sampleDevice(), info);
    expect(purifier.preFilterPct).toBe(80); // 100 - 20
    expect(purifier.max2Pct).toBe(70); // 100 - 30
  });

  it("mode flags", () => {
    const info = sampleParsedInfo();
    // mode_value == 1 => auto_mode
    expect(buildPurifier(sampleDevice(), info).autoMode).toBe(true);

    info.statusInfo["0002"] = 2;
    expect(buildPurifier(sampleDevice(), info).nightMode).toBe(true);

    info.statusInfo["0002"] = 5;
    expect(buildPurifier(sampleDevice(), info).rapidMode).toBe(true);

    info.statusInfo["0002"] = 6;
    const p = buildPurifier(sampleDevice(), info);
    expect(p.ecoMode).toBe(true);
  });

  it("handles no aq grade", () => {
    const info = sampleParsedInfo();
    info.aqGrade = null;
    const purifier = buildPurifier(sampleDevice(), info);
    expect(purifier.aqGrade).toBeNull();
  });

  it("odor filter prefers supply data", () => {
    const info = sampleParsedInfo();
    info.filterInfo["odor-filter"] = { filterRemain: 35 };
    const purifier = buildPurifier(sampleDevice(), info);
    expect(purifier.odorFilterPct).toBe(35);
  });
});

// ── parseControlStatus ─────────────────────────────────────────

describe("parseControlStatus", () => {
  it("converts string values to numbers", () => {
    const result = parseControlStatus(sampleControlResponse());
    expect(result["0001"]).toBe(1);
    expect(result["0002"]).toBe(1);
    expect(result["0003"]).toBe(2);
    expect(result["0007"]).toBe(2);
    expect(result["000A"]).toBe(3);
  });

  it("handles empty controlStatus", () => {
    const result = parseControlStatus({});
    expect(result).toEqual({});
  });

  it("handles missing controlStatus key", () => {
    const result = parseControlStatus({ other: "data" });
    expect(result).toEqual({});
  });
});

// ── parseAirHome ───────────────────────────────────────────────

describe("parseAirHome", () => {
  it("maps IAQ fields to sensor keys", () => {
    const { sensorInfo } = parseAirHome(sampleAirHomeResponse());
    expect(sensorInfo.PM25_IDX).toBe(15); // dustpm25
    expect(sensorInfo.PM10_IDX).toBe(25); // dustpm10
    expect(sensorInfo.CO2_IDX).toBe(450);
    expect(sensorInfo.VOCs_IDX).toBe(10);
    expect(sensorInfo.IAQ).toBe(50);
  });

  it("extracts aq grade", () => {
    const { aqGrade } = parseAirHome(sampleAirHomeResponse());
    expect(aqGrade).toEqual({ iaqGrade: 1 });
  });

  it("extracts network info", () => {
    const { networkInfo } = parseAirHome(sampleAirHomeResponse());
    expect(networkInfo.wifiConnected).toBe(true);
  });

  it("skips empty string IAQ fields", () => {
    const data = {
      IAQ: { dustpm25: "", dustpm10: "25", co2: "", vocs: "" },
      netStatus: {},
    };
    const { sensorInfo } = parseAirHome(data);
    expect(sensorInfo.PM25_IDX).toBeUndefined();
    expect(sensorInfo.PM10_IDX).toBe(25);
    expect(sensorInfo.CO2_IDX).toBeUndefined();
  });

  it("handles empty data", () => {
    const { sensorInfo, networkInfo, aqGrade } = parseAirHome({});
    expect(sensorInfo).toEqual({});
    expect(networkInfo).toEqual({});
    expect(aqGrade).toBeNull();
  });
});

// ── buildParsedInfoFromJson ────────────────────────────────────

describe("buildParsedInfoFromJson", () => {
  it("combines control and air data into ParsedInfo", () => {
    const parsed = buildParsedInfoFromJson(
      sampleControlResponse(),
      sampleAirHomeResponse(),
      sampleUserDevice(),
    );

    expect(parsed.statusInfo["0001"]).toBe(1);
    expect(parsed.statusInfo["0003"]).toBe(2);
    expect(parsed.sensorInfo.PM25_IDX).toBe(15);
    expect(parsed.sensorInfo.CO2_IDX).toBe(450);
    expect(parsed.aqGrade).toEqual({ iaqGrade: 1 });
    expect(parsed.networkInfo.wifiConnected).toBe(true);
    expect(parsed.deviceInfo.prodName).toBe("AIRMEGA 250S");
  });

  it("works without user device", () => {
    const parsed = buildParsedInfoFromJson(
      sampleControlResponse(),
      sampleAirHomeResponse(),
    );
    expect(parsed.statusInfo["0001"]).toBe(1);
    expect(parsed.sensorInfo.PM25_IDX).toBe(15);
    expect(parsed.deviceInfo).toEqual({});
  });

  it("produces a CowayPurifier via buildPurifier", () => {
    const parsed = buildParsedInfoFromJson(
      sampleControlResponse(),
      sampleAirHomeResponse(),
      sampleUserDevice(),
    );
    parsed.filterInfo = {
      "pre-filter": { filterRemain: 80, replaceCycle: 112 },
      max2: { filterRemain: 65 },
    };

    const purifier = buildPurifier(sampleDevice(), parsed);

    expect(purifier.isOn).toBe(true);
    expect(purifier.autoMode).toBe(true);
    expect(purifier.fanSpeed).toBe(2);
    expect(purifier.lightOn).toBe(true);
    expect(purifier.particulateMatter2_5).toBe(15);
    expect(purifier.particulateMatter10).toBe(25);
    expect(purifier.carbonDioxide).toBe(450);
    expect(purifier.preFilterPct).toBe(80);
    expect(purifier.max2Pct).toBe(65);
    expect(purifier.aqGrade).toBe(1);
    expect(purifier.networkStatus).toBe(true);
  });
});

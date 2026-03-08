/**
 * Integration tests for coway-js against the real Coway IoCare API.
 *
 * Requires COWAY_USERNAME and COWAY_PASSWORD in .anton/test-app/.env
 * Tests are automatically skipped when credentials are not available.
 *
 * Run:  npx vitest run tests/integration.test.ts
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { CowayClient } from "../src/client.js";
import type {
  DeviceAttributes,
  FilterInfo,
  PurifierData,
  PurifierDeviceSummary,
} from "../src/devices/models.js";
import type { MaintenanceInfo } from "../src/account/maintenance.js";

// ---------------------------------------------------------------------------
// Load credentials from .anton/test-app/.env
// ---------------------------------------------------------------------------
function loadEnv(): { username: string; password: string } | null {
  const root = path.resolve(import.meta.dirname ?? __dirname, "..");
  const candidates = [
    path.join(root, ".env"),
    path.join(root, ".anton/test-app/.env"),
  ];
  const envPath = candidates.find((p) => fs.existsSync(p));
  if (!envPath) return null;

  const lines = fs.readFileSync(envPath, "utf-8").split("\n");
  const vars: Record<string, string> = {};
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx === -1) continue;
    vars[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
  }

  const username = vars.COWAY_USERNAME;
  const password = vars.COWAY_PASSWORD;
  if (
    !username ||
    !password ||
    username === "your-email@example.com" ||
    password === "your-password"
  ) {
    return null;
  }
  return { username, password };
}

const creds = loadEnv();
const HAS_CREDENTIALS = creds !== null;

// ---------------------------------------------------------------------------
// Integration test suite — skipped automatically without credentials
// ---------------------------------------------------------------------------
describe.skipIf(!HAS_CREDENTIALS)("Integration: Coway API", () => {
  let client: CowayClient;
  let rawPurifiers: PurifierDeviceSummary[];
  let purifierData: PurifierData;

  // Use a single client for the entire suite to avoid repeated logins
  beforeAll(async () => {
    client = new CowayClient(creds?.username ?? "", creds?.password ?? "", {
      skipPasswordChange: true,
    });
  }, 120_000);

  afterAll(async () => {
    await client?.close();
  });

  // -----------------------------------------------------------------------
  // Authentication
  // -----------------------------------------------------------------------
  describe("Authentication", () => {
    it("should log in successfully", async () => {
      await client.login();

      // After login the client should have an access token and places
      const internals = client as unknown as {
        accessToken: string | null;
        refreshToken: string | null;
        tokenExpiration: Date | null;
        places: unknown[] | null;
        countryCode: string | null;
      };

      expect(internals.accessToken).toBeTruthy();
      expect(internals.refreshToken).toBeTruthy();
      expect(internals.tokenExpiration).toBeInstanceOf(Date);
      expect((internals.tokenExpiration as Date).getTime()).toBeGreaterThan(Date.now());
      expect(internals.countryCode).toBeTruthy();
      expect(internals.places).toBeInstanceOf(Array);
      expect((internals.places as unknown[]).length).toBeGreaterThan(0);
    }, 60_000);

    it("places should have placeId and deviceCnt", () => {
      const internals = client as unknown as {
        places: { placeId: string; deviceCnt: number }[];
      };

      for (const place of internals.places) {
        expect(place.placeId).toBeTruthy();
        expect(typeof place.placeId).toBe("string");
        expect(typeof place.deviceCnt).toBe("number");
      }
    });

    it("should have at least one place with devices", () => {
      const internals = client as unknown as {
        places: { deviceCnt: number }[];
      };
      const active = internals.places.filter((p) => p.deviceCnt > 0);
      expect(active.length).toBeGreaterThan(0);
    });
  });

  // -----------------------------------------------------------------------
  // Device discovery
  // -----------------------------------------------------------------------
  describe("Device discovery", () => {
    it("should fetch purifier device list", async () => {
      rawPurifiers = await client.asyncGetPurifiers();

      expect(rawPurifiers).toBeInstanceOf(Array);
      expect(rawPurifiers.length).toBeGreaterThan(0);
    }, 60_000);

    it("each device summary should have required fields", () => {
      for (const dev of rawPurifiers) {
        expect(dev.deviceSerial).toBeTruthy();
        expect(typeof dev.deviceSerial).toBe("string");

        expect(dev.modelCode).toBeTruthy();
        expect(typeof dev.modelCode).toBe("string");

        expect(dev.placeId).toBeTruthy();
        expect(typeof dev.placeId).toBe("string");

        expect(typeof dev.dvcNick).toBe("string");
        expect(typeof dev.productModel).toBe("string");
      }
    });

    it("all devices should be purifiers (categoryName)", () => {
      for (const dev of rawPurifiers) {
        // CATEGORY_NAME is Korean for purifier: "청정기"
        expect(dev.categoryName).toBe("청정기");
      }
    });
  });

  // -----------------------------------------------------------------------
  // Full purifier data
  // -----------------------------------------------------------------------
  describe("Purifier data", () => {
    it("should fetch full purifier data", async () => {
      purifierData = await client.asyncGetPurifiersData();

      expect(purifierData).toBeDefined();
      expect(purifierData.purifiers).toBeDefined();
      expect(typeof purifierData.purifiers).toBe("object");

      const ids = Object.keys(purifierData.purifiers);
      expect(ids.length).toBeGreaterThan(0);
    }, 120_000);

    it("purifierData keys should match device serials", () => {
      const ids = Object.keys(purifierData.purifiers);
      const serials = rawPurifiers.map((d) => d.deviceSerial);
      for (const id of ids) {
        expect(serials).toContain(id);
      }
    });

    // -------------------------------------------------------------------
    // DeviceAttributes
    // -------------------------------------------------------------------
    describe("DeviceAttributes", () => {
      it("each purifier should have valid deviceAttr", () => {
        for (const purifier of Object.values(purifierData.purifiers)) {
          const attr: DeviceAttributes = purifier.deviceAttr;
          expect(attr).toBeDefined();
          expect(attr.deviceId).toBeTruthy();
          expect(typeof attr.deviceId).toBe("string");
          expect(attr.name).toBeTruthy();
          expect(typeof attr.name).toBe("string");
        }
      });

      it("deviceAttr should contain model information", () => {
        for (const purifier of Object.values(purifierData.purifiers)) {
          const attr = purifier.deviceAttr;
          // At least one of model or modelCode should be set
          const hasModel = attr.model !== null || attr.modelCode !== null;
          expect(hasModel).toBe(true);
        }
      });

      it("deviceAttr.placeId should be set", () => {
        for (const purifier of Object.values(purifierData.purifiers)) {
          expect(purifier.deviceAttr.placeId).toBeTruthy();
        }
      });
    });

    // -------------------------------------------------------------------
    // Air quality data
    // -------------------------------------------------------------------
    describe("Air quality", () => {
      it("should have air quality fields with correct types", () => {
        for (const purifier of Object.values(purifierData.purifiers)) {
          // These can be null if the purifier is off, but should be number | null
          expectNumberOrNull(purifier.particulateMatter2_5, "pm2.5");
          expectNumberOrNull(purifier.particulateMatter10, "pm10");
          expectNumberOrNull(purifier.carbonDioxide, "co2");
          expectNumberOrNull(purifier.volatileOrganicCompounds, "voc");
          expectNumberOrNull(purifier.airQualityIndex, "aqi");
          expectNumberOrNull(purifier.aqGrade, "aqGrade");
        }
      });

      it("air quality grade should be 1-4 when present", () => {
        for (const purifier of Object.values(purifierData.purifiers)) {
          if (purifier.aqGrade !== null) {
            expect(purifier.aqGrade).toBeGreaterThanOrEqual(1);
            expect(purifier.aqGrade).toBeLessThanOrEqual(4);
          }
        }
      });

      it("PM2.5 should be non-negative when present", () => {
        for (const purifier of Object.values(purifierData.purifiers)) {
          if (purifier.particulateMatter2_5 !== null) {
            expect(purifier.particulateMatter2_5).toBeGreaterThanOrEqual(0);
          }
        }
      });
    });

    // -------------------------------------------------------------------
    // Power & Mode state
    // -------------------------------------------------------------------
    describe("Power and mode state", () => {
      it("isOn should be boolean or null", () => {
        for (const purifier of Object.values(purifierData.purifiers)) {
          expectBooleanOrNull(purifier.isOn, "isOn");
        }
      });

      it("mode flags should be boolean or null", () => {
        for (const purifier of Object.values(purifierData.purifiers)) {
          expectBooleanOrNull(purifier.autoMode, "autoMode");
          expectBooleanOrNull(purifier.ecoMode, "ecoMode");
          expectBooleanOrNull(purifier.nightMode, "nightMode");
          expectBooleanOrNull(purifier.rapidMode, "rapidMode");
        }
      });

      it("fan speed should be a small integer when present", () => {
        for (const purifier of Object.values(purifierData.purifiers)) {
          if (purifier.fanSpeed !== null) {
            expect(typeof purifier.fanSpeed).toBe("number");
            expect(Number.isInteger(purifier.fanSpeed)).toBe(true);
            expect(purifier.fanSpeed).toBeGreaterThanOrEqual(0);
            expect(purifier.fanSpeed).toBeLessThanOrEqual(3);
          }
        }
      });

      it("lightOn should be boolean or null", () => {
        for (const purifier of Object.values(purifierData.purifiers)) {
          expectBooleanOrNull(purifier.lightOn, "lightOn");
        }
      });

      it("lightMode should be a number or null", () => {
        for (const purifier of Object.values(purifierData.purifiers)) {
          expectNumberOrNull(purifier.lightMode, "lightMode");
        }
      });
    });

    // -------------------------------------------------------------------
    // Inline filter percentages (from HTML)
    // -------------------------------------------------------------------
    describe("Filter percentages", () => {
      it("pre-filter % should be 0-100 or null", () => {
        for (const purifier of Object.values(purifierData.purifiers)) {
          expectPercentageOrNull(purifier.preFilterPct, "preFilterPct");
        }
      });

      it("MAX2 % should be 0-100 or null", () => {
        for (const purifier of Object.values(purifierData.purifiers)) {
          expectPercentageOrNull(purifier.max2Pct, "max2Pct");
        }
      });

      it("odor filter % should be 0-100 or null", () => {
        for (const purifier of Object.values(purifierData.purifiers)) {
          expectPercentageOrNull(purifier.odorFilterPct, "odorFilterPct");
        }
      });
    });

    // -------------------------------------------------------------------
    // Detailed filter info (from supplies API)
    // -------------------------------------------------------------------
    describe("Filter info (supplies)", () => {
      it("filters should be an array or null", () => {
        for (const purifier of Object.values(purifierData.purifiers)) {
          if (purifier.filters !== null) {
            expect(Array.isArray(purifier.filters)).toBe(true);
          }
        }
      });

      it("each filter should have required fields", () => {
        for (const purifier of Object.values(purifierData.purifiers)) {
          if (!purifier.filters) continue;
          for (const f of purifier.filters) {
            validateFilterInfo(f);
          }
        }
      });

      it("filter remain should be 0-100 when present", () => {
        for (const purifier of Object.values(purifierData.purifiers)) {
          if (!purifier.filters) continue;
          for (const f of purifier.filters) {
            if (f.filterRemain !== null) {
              expect(f.filterRemain).toBeGreaterThanOrEqual(0);
              expect(f.filterRemain).toBeLessThanOrEqual(100);
            }
          }
        }
      });

      it("filter status should be a known value when present", () => {
        const validStatuses = ["AVAILABLE", "INITIAL", "REPLACE"];
        for (const purifier of Object.values(purifierData.purifiers)) {
          if (!purifier.filters) continue;
          for (const f of purifier.filters) {
            if (f.filterRemainStatus !== null) {
              expect(validStatuses).toContain(f.filterRemainStatus);
            }
          }
        }
      });

      it("pollutants should be a string array", () => {
        for (const purifier of Object.values(purifierData.purifiers)) {
          if (!purifier.filters) continue;
          for (const f of purifier.filters) {
            expect(Array.isArray(f.pollutants)).toBe(true);
            for (const p of f.pollutants) {
              expect(typeof p).toBe("string");
            }
          }
        }
      });
    });

    // -------------------------------------------------------------------
    // Timer & misc
    // -------------------------------------------------------------------
    describe("Timer and misc", () => {
      it("timer should be string or null", () => {
        for (const purifier of Object.values(purifierData.purifiers)) {
          if (purifier.timer !== null) {
            expect(typeof purifier.timer).toBe("string");
          }
        }
      });

      it("timerRemaining should be number or null", () => {
        for (const purifier of Object.values(purifierData.purifiers)) {
          expectNumberOrNull(purifier.timerRemaining, "timerRemaining");
        }
      });

      it("buttonLock should be number or null", () => {
        for (const purifier of Object.values(purifierData.purifiers)) {
          expectNumberOrNull(purifier.buttonLock, "buttonLock");
        }
      });

      it("networkStatus should be boolean or null", () => {
        for (const purifier of Object.values(purifierData.purifiers)) {
          expectBooleanOrNull(purifier.networkStatus, "networkStatus");
        }
      });

      it("mcuVersion should be string or null", () => {
        for (const purifier of Object.values(purifierData.purifiers)) {
          if (purifier.mcuVersion !== null) {
            expect(typeof purifier.mcuVersion).toBe("string");
          }
        }
      });

      it("smartModeSensitivity should be number or null", () => {
        for (const purifier of Object.values(purifierData.purifiers)) {
          expectNumberOrNull(purifier.smartModeSensitivity, "smartModeSensitivity");
        }
      });

      it("preFilterChangeFrequency should be number or null", () => {
        for (const purifier of Object.values(purifierData.purifiers)) {
          expectNumberOrNull(
            purifier.preFilterChangeFrequency,
            "preFilterChangeFrequency",
          );
        }
      });
    });
  });

  // -----------------------------------------------------------------------
  // Maintenance notices
  // -----------------------------------------------------------------------
  describe("Maintenance notices", () => {
    it("should check maintenance without error", async () => {
      await expect(
        client.asyncServerMaintenanceNotice(),
      ).resolves.not.toThrow();
    }, 30_000);

    it("maintenance info should have correct shape when present", () => {
      const internals = client as unknown as {
        serverMaintenance: MaintenanceInfo | null;
      };
      if (internals.serverMaintenance) {
        expect(typeof internals.serverMaintenance.sequence).toBe("number");
        expect(typeof internals.serverMaintenance.description).toBe("string");
        // Dates can be null if not parseable from notice text
        if (internals.serverMaintenance.startDateTime) {
          expect(internals.serverMaintenance.startDateTime).toBeInstanceOf(Date);
        }
        if (internals.serverMaintenance.endDateTime) {
          expect(internals.serverMaintenance.endDateTime).toBeInstanceOf(Date);
        }
      }
    });
  });

  // -----------------------------------------------------------------------
  // Consistency checks
  // -----------------------------------------------------------------------
  describe("Consistency", () => {
    it("second fetch should return same device set", async () => {
      const secondFetch = await client.asyncGetPurifiers();
      const firstIds = rawPurifiers.map((d) => d.deviceSerial).sort();
      const secondIds = secondFetch.map((d) => d.deviceSerial).sort();
      expect(secondIds).toEqual(firstIds);
    }, 60_000);

    it("purifier data should serialize to JSON", () => {
      const json = JSON.stringify(purifierData);
      expect(typeof json).toBe("string");
      const parsed = JSON.parse(json);
      expect(Object.keys(parsed.purifiers).length).toBe(
        Object.keys(purifierData.purifiers).length,
      );
    });
  });
});

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------
function expectNumberOrNull(
  val: unknown,
  label: string,
): void {
  if (val !== null && val !== undefined) {
    expect(typeof val, `${label} should be number`).toBe("number");
    expect(Number.isFinite(val), `${label} should be finite`).toBe(true);
  }
}

function expectBooleanOrNull(
  val: unknown,
  label: string,
): void {
  if (val !== null && val !== undefined) {
    expect(
      typeof val === "boolean",
      `${label} should be boolean, got ${typeof val}: ${val}`,
    ).toBe(true);
  }
}

function expectPercentageOrNull(
  val: unknown,
  label: string,
): void {
  if (val !== null && val !== undefined) {
    expect(typeof val, `${label} should be number`).toBe("number");
    expect(val as number, `${label} should be >= 0`).toBeGreaterThanOrEqual(0);
    expect(val as number, `${label} should be <= 100`).toBeLessThanOrEqual(100);
  }
}

function validateFilterInfo(f: FilterInfo): void {
  // name is string or null
  if (f.name !== null) {
    expect(typeof f.name).toBe("string");
  }

  // filterRemain is number or null
  expectNumberOrNull(f.filterRemain, "filterRemain");

  // filterRemainStatus is string or null (e.g., "AVAILABLE", "INITIAL", "REPLACE")
  if (f.filterRemainStatus !== null) {
    expect(typeof f.filterRemainStatus).toBe("string");
  }

  // replaceCycle is number or null
  expectNumberOrNull(f.replaceCycle, "replaceCycle");

  // replaceCycleUnit is string or null (e.g., "M" for months, "W" for weeks)
  if (f.replaceCycleUnit !== null) {
    expect(typeof f.replaceCycleUnit).toBe("string");
  }

  // dates are string or null
  if (f.lastDate !== null) {
    expect(typeof f.lastDate).toBe("string");
  }
  if (f.nextDate !== null) {
    expect(typeof f.nextDate).toBe("string");
  }

  // pollutants is always an array
  expect(Array.isArray(f.pollutants)).toBe(true);

  // boolean fields
  expect(typeof f.preFilter).toBe("boolean");
  expect(typeof f.serverReset).toBe("boolean");
}

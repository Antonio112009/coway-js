/**
 * Integration tests — Control commands against the real Coway IoCare API.
 *
 * ⚠️  These tests SEND REAL COMMANDS to your purifier.
 *     They attempt to restore original state afterward.
 *
 * Requires COWAY_USERNAME and COWAY_PASSWORD in .anton/test-app/.env
 * Tests are automatically skipped when credentials are not available.
 *
 * Run:  npx vitest run tests/integration-control.test.ts
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { CowayClient } from "../src/client.js";
import { LightMode } from "../src/constants.js";
import type { CowayPurifier, DeviceAttributes } from "../src/devices/models.js";

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

/** Small delay between control commands to avoid hammering the API. */
const COMMAND_DELAY = 2000;
function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ---------------------------------------------------------------------------
// Control integration tests — skipped automatically without credentials
// ---------------------------------------------------------------------------
describe.skipIf(!HAS_CREDENTIALS)("Integration: Control commands", () => {
  let client: CowayClient;
  let deviceAttr: DeviceAttributes;
  let originalState: CowayPurifier;

  beforeAll(async () => {
    client = new CowayClient(creds?.username ?? "", creds?.password ?? "", {
      skipPasswordChange: true,
    });

    // Login and get the first purifier
    const data = await client.asyncGetPurifiersData();
    const ids = Object.keys(data.purifiers);
    expect(ids.length).toBeGreaterThan(0);

    const firstId = ids[0];
    originalState = data.purifiers[firstId];
    deviceAttr = originalState.deviceAttr;

    expect(deviceAttr.deviceId).toBeTruthy();
    expect(deviceAttr.placeId).toBeTruthy();
  }, 120_000);

  afterAll(async () => {
    // Best-effort restore of original state
    try {
      if (originalState.isOn === true) {
        await client.asyncSetPower(deviceAttr, true);
        await delay(COMMAND_DELAY);

        // Restore mode
        if (originalState.autoMode) {
          await client.asyncSetAutoMode(deviceAttr);
        } else if (originalState.nightMode) {
          await client.asyncSetNightMode(deviceAttr);
        } else if (originalState.fanSpeed !== null) {
          const speed = String(
            Math.min(Math.max(originalState.fanSpeed, 1), 3),
          ) as "1" | "2" | "3";
          await client.asyncSetFanSpeed(deviceAttr, speed);
        }
        await delay(COMMAND_DELAY);

        // Restore light
        if (originalState.lightOn !== null) {
          await client.asyncSetLight(deviceAttr, originalState.lightOn);
        }
      } else if (originalState.isOn === false) {
        await client.asyncSetPower(deviceAttr, false);
      }
    } catch {
      // Swallow errors during cleanup — don't mask test failures
    }

    await client?.close();
  }, 60_000);

  // -----------------------------------------------------------------------
  // Power
  // -----------------------------------------------------------------------
  describe("Power", () => {
    it("should turn the purifier ON", async () => {
      await expect(
        client.asyncSetPower(deviceAttr, true),
      ).resolves.not.toThrow();
      await delay(COMMAND_DELAY);
    }, 30_000);

    it("should turn the purifier OFF", async () => {
      await expect(
        client.asyncSetPower(deviceAttr, false),
      ).resolves.not.toThrow();
      await delay(COMMAND_DELAY);
    }, 30_000);

    it("should turn it back ON for remaining tests", async () => {
      await expect(
        client.asyncSetPower(deviceAttr, true),
      ).resolves.not.toThrow();
      await delay(COMMAND_DELAY);
    }, 30_000);
  });

  // -----------------------------------------------------------------------
  // Modes
  // -----------------------------------------------------------------------
  describe("Modes", () => {
    it("should set auto mode", async () => {
      await expect(
        client.asyncSetAutoMode(deviceAttr),
      ).resolves.not.toThrow();
      await delay(COMMAND_DELAY);
    }, 30_000);

    it("should set night mode", async () => {
      await expect(
        client.asyncSetNightMode(deviceAttr),
      ).resolves.not.toThrow();
      await delay(COMMAND_DELAY);
    }, 30_000);

    it("should switch back to auto mode", async () => {
      await expect(
        client.asyncSetAutoMode(deviceAttr),
      ).resolves.not.toThrow();
      await delay(COMMAND_DELAY);
    }, 30_000);
  });

  // -----------------------------------------------------------------------
  // Fan speed
  // -----------------------------------------------------------------------
  describe("Fan speed", () => {
    it("should set fan speed to 1", async () => {
      await expect(
        client.asyncSetFanSpeed(deviceAttr, "1"),
      ).resolves.not.toThrow();
      await delay(COMMAND_DELAY);
    }, 30_000);

    it("should set fan speed to 2", async () => {
      await expect(
        client.asyncSetFanSpeed(deviceAttr, "2"),
      ).resolves.not.toThrow();
      await delay(COMMAND_DELAY);
    }, 30_000);

    it("should set fan speed to 3", async () => {
      await expect(
        client.asyncSetFanSpeed(deviceAttr, "3"),
      ).resolves.not.toThrow();
      await delay(COMMAND_DELAY);
    }, 30_000);

    it("should reject invalid fan speed", async () => {
      await expect(
        // @ts-expect-error testing invalid input
        client.asyncSetFanSpeed(deviceAttr, "5"),
      ).rejects.toThrow("Invalid fan speed");
    });
  });

  // -----------------------------------------------------------------------
  // Light
  // -----------------------------------------------------------------------
  describe("Light", () => {
    it("should turn light on", async () => {
      await expect(
        client.asyncSetLight(deviceAttr, true),
      ).resolves.not.toThrow();
      await delay(COMMAND_DELAY);
    }, 30_000);

    it("should turn light off", async () => {
      await expect(
        client.asyncSetLight(deviceAttr, false),
      ).resolves.not.toThrow();
      await delay(COMMAND_DELAY);
    }, 30_000);

    it("should set light mode ON", async () => {
      await expect(
        client.asyncSetLightMode(deviceAttr, LightMode.ON),
      ).resolves.not.toThrow();
      await delay(COMMAND_DELAY);
    }, 30_000);

    it("should set light mode OFF", async () => {
      await expect(
        client.asyncSetLightMode(deviceAttr, LightMode.OFF),
      ).resolves.not.toThrow();
      await delay(COMMAND_DELAY);
    }, 30_000);
  });

  // -----------------------------------------------------------------------
  // Timer
  // -----------------------------------------------------------------------
  describe("Timer", () => {
    it("should set timer to 60 minutes", async () => {
      await expect(
        client.asyncSetTimer(deviceAttr, "60"),
      ).resolves.not.toThrow();
      await delay(COMMAND_DELAY);
    }, 30_000);

    it("should cancel timer", async () => {
      await expect(
        client.asyncSetTimer(deviceAttr, "0"),
      ).resolves.not.toThrow();
      await delay(COMMAND_DELAY);
    }, 30_000);
  });

  // -----------------------------------------------------------------------
  // Smart sensitivity
  // -----------------------------------------------------------------------
  describe("Smart mode sensitivity", () => {
    it("should set sensitivity to Sensitive (1)", async () => {
      await expect(
        client.asyncSetSmartModeSensitivity(deviceAttr, "1"),
      ).resolves.not.toThrow();
      await delay(COMMAND_DELAY);
    }, 30_000);

    it("should set sensitivity to Moderate (2)", async () => {
      await expect(
        client.asyncSetSmartModeSensitivity(deviceAttr, "2"),
      ).resolves.not.toThrow();
      await delay(COMMAND_DELAY);
    }, 30_000);

    it("should set sensitivity to Insensitive (3)", async () => {
      await expect(
        client.asyncSetSmartModeSensitivity(deviceAttr, "3"),
      ).resolves.not.toThrow();
      await delay(COMMAND_DELAY);
    }, 30_000);
  });

  // -----------------------------------------------------------------------
  // Button lock
  // -----------------------------------------------------------------------
  describe("Button lock", () => {
    it("should enable button lock", async () => {
      await expect(
        client.asyncSetButtonLock(deviceAttr, "1"),
      ).resolves.not.toThrow();
      await delay(COMMAND_DELAY);
    }, 30_000);

    it("should disable button lock", async () => {
      await expect(
        client.asyncSetButtonLock(deviceAttr, "0"),
      ).resolves.not.toThrow();
      await delay(COMMAND_DELAY);
    }, 30_000);
  });

  // -----------------------------------------------------------------------
  // Verify state changed — re-fetch after commands
  // -----------------------------------------------------------------------
  describe("State verification", () => {
    it("re-fetched data should reflect a powered-on purifier", async () => {
      // Ensure it's on and in auto mode for verification
      await client.asyncSetPower(deviceAttr, true);
      await delay(COMMAND_DELAY);
      await client.asyncSetAutoMode(deviceAttr);
      await delay(COMMAND_DELAY * 2); // Extra wait for state to propagate

      const data = await client.asyncGetPurifiersData();
      const deviceId = deviceAttr.deviceId;
      expect(deviceId).toBeTruthy();

      const purifier = data.purifiers[deviceId as string];
      expect(purifier).toBeDefined();
      expect(purifier.isOn).toBe(true);
    }, 120_000);
  });
});

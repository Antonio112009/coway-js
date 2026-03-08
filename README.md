# coway-js

[![License: MIT](https://img.shields.io/badge/license-MIT-green)](LICENSE)

Typed async client for Coway AIRMEGA devices through [Coway IoCare](https://iocare.com/), built with TypeScript.

> TypeScript port of [pycoway](https://github.com/antonio112009/pycoway).

## Features

- Async API built on the native `fetch` API (Node.js 18+)
- Fully typed interfaces for purifier state
- Device control: power, fan speed, light, timers, modes, button lock, and more
- Air-quality readings: PM2.5, PM10, CO₂, VOC, AQI
- Filter health monitoring: pre-filter, MAX2, and odor filter with detailed supply info
- Automatic token and session management
- Dual ESM/CJS output via [tsup](https://tsup.egoist.dev/)
- Tests with [Vitest](https://vitest.dev/)

## Requirements

- Node.js 18 or newer
- A Coway IoCare account with at least one registered purifier

## Installation

```bash
npm install coway-js
```

## Quick Start

```typescript
import { CowayClient } from "coway-js";

const client = new CowayClient("email@example.com", "password");

try {
  await client.login();
  const data = await client.asyncGetPurifiersData();

  for (const [deviceId, purifier] of Object.entries(data.purifiers)) {
    console.log(`${purifier.deviceAttr.name} (${deviceId})`);
    console.log(`  Power: ${purifier.isOn ? "On" : "Off"}`);
    console.log(`  Fan Speed: ${purifier.fanSpeed}`);
    console.log(`  PM2.5: ${purifier.particulateMatter2_5}`);
    console.log(`  AQI: ${purifier.airQualityIndex}`);
  }
} finally {
  await client.close();
}
```

### Using Explicit Resource Management (Node.js 22+)

```typescript
import { CowayClient } from "coway-js";

await using client = new CowayClient("email@example.com", "password");
await client.login();
const data = await client.asyncGetPurifiersData();
```

## Skipping Password Change Prompt

Coway requires users to change their password every 60 days. To skip this prompt:

```typescript
const client = new CowayClient("email@example.com", "password", {
  skipPasswordChange: true,
});
await client.login();
```

## Device Control

Every control method accepts the `deviceAttr` from a `CowayPurifier` instance:

```typescript
import { CowayClient, LightMode } from "coway-js";

const client = new CowayClient("email@example.com", "password");
await client.login();

const data = await client.asyncGetPurifiersData();
const purifier = Object.values(data.purifiers)[0];
const attr = purifier.deviceAttr;

await client.asyncSetPower(attr, true);
await client.asyncSetAutoMode(attr);
await client.asyncSetFanSpeed(attr, "2");
await client.asyncSetLight(attr, true);
await client.asyncSetLightMode(attr, LightMode.AQI_OFF);
await client.asyncSetTimer(attr, "120");

await client.close();
```

### Available Control Methods

| Method | Parameters | Description |
|---|---|---|
| `asyncSetPower()` | `isOn: boolean` | Turn purifier on or off |
| `asyncSetAutoMode()` | — | Switch to auto mode |
| `asyncSetNightMode()` | — | Switch to night mode |
| `asyncSetEcoMode()` | — | Switch to eco mode (AP-1512HHS only) |
| `asyncSetRapidMode()` | — | Switch to rapid mode (250s only) |
| `asyncSetFanSpeed()` | `speed: "1" \| "2" \| "3"` | Set fan speed |
| `asyncSetLight()` | `lightOn: boolean` | Toggle light on/off (not for 250s) |
| `asyncSetLightMode()` | `lightMode: LightModeValue` | Set light mode for advanced models |
| `asyncSetTimer()` | `time: "0" \| "60" \| "120" \| "240" \| "480"` | Off timer in minutes |
| `asyncSetSmartModeSensitivity()` | `sensitivity: "1" \| "2" \| "3"` | Smart mode sensitivity |
| `asyncSetButtonLock()` | `value: "0" \| "1"` | Button lock on/off |
| `asyncChangePrefilterSetting()` | `value: 2 \| 3 \| 4` | Wash frequency in weeks |

## Data Model

`asyncGetPurifiersData()` returns a `PurifierData` object containing a `purifiers` record keyed by device ID.

Each `CowayPurifier` includes:

### Device Identity

| Field | Type | Description |
|---|---|---|
| `deviceAttr` | `DeviceAttributes` | Device ID, model, name, place ID |
| `mcuVersion` | `string \| null` | Firmware version |
| `networkStatus` | `boolean \| null` | Network connectivity |

### Control State

| Field | Type | Description |
|---|---|---|
| `isOn` | `boolean \| null` | Power state |
| `autoMode` | `boolean \| null` | Auto mode |
| `autoEcoMode` | `boolean \| null` | Auto eco mode |
| `ecoMode` | `boolean \| null` | Eco mode |
| `nightMode` | `boolean \| null` | Night mode |
| `rapidMode` | `boolean \| null` | Rapid mode |
| `fanSpeed` | `number \| null` | Fan speed level |
| `lightOn` | `boolean \| null` | Light state |
| `lightMode` | `number \| null` | Device-specific light mode |
| `buttonLock` | `number \| null` | Button lock state |
| `smartModeSensitivity` | `number \| null` | Smart mode sensitivity level |
| `timer` | `string \| null` | Configured off timer |
| `timerRemaining` | `number \| null` | Remaining timer (minutes) |

### Air Quality

| Field | Type | Description |
|---|---|---|
| `particulateMatter2_5` | `number \| null` | PM2.5 (μg/m³) |
| `particulateMatter10` | `number \| null` | PM10 (μg/m³) |
| `carbonDioxide` | `number \| null` | CO₂ (ppm) |
| `volatileOrganicCompounds` | `number \| null` | VOC level |
| `airQualityIndex` | `number \| null` | AQI value |
| `aqGrade` | `number \| null` | Air quality grade |
| `luxSensor` | `number \| null` | Ambient light sensor |

### Filter Health

| Field | Type | Description |
|---|---|---|
| `preFilterPct` | `number \| null` | Pre-filter remaining (%) |
| `preFilterChangeFrequency` | `number \| null` | Wash frequency (weeks) |
| `max2Pct` | `number \| null` | MAX2 filter remaining (%) |
| `odorFilterPct` | `number \| null` | Odor filter remaining (%) |
| `filters` | `FilterInfo[] \| null` | Detailed info for each filter/supply |

### FilterInfo

| Field | Type | Description |
|---|---|---|
| `name` | `string \| null` | Filter name |
| `filterRemain` | `number \| null` | Filter life remaining (%) |
| `filterRemainStatus` | `string \| null` | Status: `INITIAL`, `AVAILABLE`, or `REPLACE` |
| `replaceCycle` | `number \| null` | Replacement cycle value |
| `replaceCycleUnit` | `string \| null` | Cycle unit: `W` (weeks) or `M` (months) |
| `lastDate` | `string \| null` | Last filter change date |
| `nextDate` | `string \| null` | Next recommended change date |
| `pollutants` | `string[]` | Pollutants the filter targets |
| `description` | `string \| null` | What the filter removes |
| `preFilter` | `boolean` | Whether this is a pre-filter |
| `serverReset` | `boolean` | Whether the filter can be reset remotely |

## Exceptions

All errors extend `CowayError`:

```typescript
import { AuthError, CowayError, PasswordExpired } from "coway-js";
```

| Error | Description |
|---|---|
| `CowayError` | Base error for all library errors |
| `AuthError` | Authentication failed |
| `PasswordExpired` | Coway requires a password change |
| `ServerMaintenance` | Coway API is under maintenance |
| `RateLimited` | Coway temporarily blocked the account |
| `NoPlaces` | No places configured in the IoCare account |
| `NoPurifiers` | No air purifiers found |

## Development

```bash
git clone https://github.com/antonio112009/coway-js.git
cd coway-js
npm install
npm run build
npm test
npm run lint
```

## License

[MIT](LICENSE)

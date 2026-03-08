/** Constants for coway-js. */

import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const pkg = require("../package.json") as { version: string };
export const VERSION = pkg.version;

export const DEFAULT_TIMEZONE = "America/Kentucky/Louisville";

/** Detect the system IANA timezone, falling back to the default. Cached after first call. */
export const detectTimezone: () => string = (() => {
  let cached: string | undefined;
  return () => {
    if (cached !== undefined) return cached;

    const tz = process.env.TZ?.trim();
    if (tz && tz.includes("/")) {
      cached = tz;
      return cached;
    }

    cached = Intl.DateTimeFormat().resolvedOptions().timeZone || DEFAULT_TIMEZONE;
    return cached;
  };
})();

export const Endpoint = {
  BASE_URI: "https://iocare.iotsvc.coway.com/api/v1",
  GET_TOKEN: "/com/token",
  NOTICES: "/com/notices",
  OAUTH_URL:
    "https://id.coway.com/auth/realms/cw-account/protocol/openid-connect/auth",
  REDIRECT_URL:
    "https://iocare-redirect.iotsvc.coway.com/redirect_bridge_empty.html",
  TOKEN_REFRESH: "/com/refresh-token",
  USER_INFO: "/com/my-info",
  PLACES: "/com/places",
  AIR: "/air/devices",
  PURIFIER_HTML_BASE: "https://iocare2.coway.com/en",
  SECONDARY_BASE: "https://iocare2.coway.com/api/proxy/api/v1",
} as const;

export const Parameter = {
  APP_VERSION: "2.15.0",
  CLIENT_ID: "cwid-prd-iocare-plus-25MJGcYX",
  CLIENT_NAME: "IOCARE",
  get TIMEZONE() {
    return detectTimezone();
  },
} as const;

export const Header = {
  ACCEPT:
    "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  ACCEPT_LANG: "en",
  CALLING_PAGE: "product",
  CONTENT_JSON: "application/json",
  COWAY_LANGUAGE: "en-US,en;q=0.9",
  COWAY_USER_AGENT: `coway-js/${VERSION}`,
  HTML_USER_AGENT: `coway-js/${VERSION}`,
  SOURCE_PATH: "iOS",
  THEME: "light",
  USER_AGENT: `coway-js/${VERSION}`,
} as const;

export const ErrorMessages = {
  BAD_TOKEN: "Unauthenticated (crypto/rsa: verification error)",
  EXPIRED_TOKEN: "Unauthenticated (Token is expired)",
  INVALID_REFRESH_TOKEN:
    "통합회원 토큰 갱신 오류 (error: invalid_grant)(error_desc: Invalid refresh token)",
  INVALID_GRANT:
    "통합회원 토큰 발급 오류 (error: invalid_grant)(error_desc: Code not valid)",
} as const;

export const LightMode = {
  AQI_OFF: "1",
  OFF: "2",
  HALF_OFF: "3",
  ON: "0",
} as const;

export type LightModeValue = (typeof LightMode)[keyof typeof LightMode];

/** Korean name for purifier category. */
export const CATEGORY_NAME = "청정기";

export const PREFILTER_CYCLE: Record<number, string> = {
  2: "112",
  3: "168",
  4: "224",
};

export const TIMEOUT = 5 * 60 * 1000; // 5 minutes in milliseconds

export const IocareApi = {
  BASE: "https://iocareapi.iot.coway.com/api/v1",
  USER_DEVICES: "/com/user-devices",
  DEVICE_CONTROL: "/com/devices",
  DEVICE_CONN: "/com/devices-conn",
  AIR_HOME: "/air/devices",
} as const;

export const TrCode = {
  USER_DEVICES: "CWIG0304",
  CONTROL_STATUS: "CWIG0602",
  DEVICE_CONN: "CWIG0607",
  AIR_HOME: "CWIA0120",
  CONTROL_DEVICE: "CWIG0603",
} as const;

export const CommandCode = {
  POWER: "0001",
  MODE: "0002",
  FAN_SPEED: "0003",
  LIGHT: "0007",
  TIMER: "0008",
  SMART_SENSITIVITY: "000A",
  BUTTON_LOCK: "0024",
  PREFILTER: "0001",
} as const;

export const SensorCode = {
  PM25: "0001",
  PM10: "0002",
  LUX: "0007",
  PRE_FILTER_USAGE: "0011",
  MAX2_FILTER_USAGE: "0012",
  ODOR_FILTER_USAGE: "0013",
} as const;

export const SensorKey = {
  PM25: "PM25_IDX",
  PM10: "PM10_IDX",
  CO2: "CO2_IDX",
  VOCS: "VOCs_IDX",
  IAQ: "IAQ",
} as const;

/** Map IoT JSON API "IAQ" field names to internal sensor keys for buildPurifier. */
export const IAQ_FIELD_MAP: Record<string, string> = {
  dustpm25: SensorKey.PM25,
  dustpm10: SensorKey.PM10,
  co2: SensorKey.CO2,
  vocs: SensorKey.VOCS,
  inairquality: SensorKey.IAQ,
};

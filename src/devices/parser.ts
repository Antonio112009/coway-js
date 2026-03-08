/** Parsing logic for building CowayPurifier objects from raw API/HTML data. */

import * as cheerio from "cheerio";

import type {
  CowayPurifier,
  DeviceAttributes,
  FilterSupply,
  FilterInfo,
  PurifierDeviceSummary,
  UserDeviceInfo,
} from "./models.js";
import { CowayError } from "../errors.js";
import { IAQ_FIELD_MAP, SensorCode, SensorKey } from "../constants.js";
import type { JsonObject } from "../types.js";

/**
 * Extract the purifier JSON data embedded in the HTML page.
 * Returns the first dict child from the top-level 'children' key, or null if not found.
 */
export function parsePurifierHtml(
  html: string,
): JsonObject | null {
  const $ = cheerio.load(html);

  try {
    const scripts = $("script")
      .toArray()
      .filter((el) => $(el).text().includes("sensorInfo"));

    if (!scripts.length) {
      throw new Error("No script with sensorInfo found");
    }

    const scriptText = $(scripts[0]).text();
    const startIndex = scriptText.indexOf("{");
    const endIndex = scriptText.lastIndexOf("}");
    const extracted = scriptText
      .slice(startIndex, endIndex + 1)
      .replace(/\\/g, "");
    const purifierJson = JSON.parse(extracted);

    if (!("children" in purifierJson)) {
      return null;
    }

    for (const data of purifierJson.children) {
      if (data && typeof data === "object" && !Array.isArray(data)) {
        return data;
      }
    }
    return null;
  } catch (exc) {
    throw new CowayError(
      `Failed to parse purifier HTML page for info: ${exc instanceof Error ? exc.message : String(exc)}`,
    );
  }
}

export interface ParsedInfo {
  deviceInfo: JsonObject;
  mcuInfo: JsonObject;
  networkInfo: JsonObject;
  sensorInfo: JsonObject;
  statusInfo: JsonObject;
  aqGrade: JsonObject | null;
  filterInfo: JsonObject;
  timerInfo: string | null;
}

/** Pull structured sections out of the raw purifier info dict. */
export function extractParsedInfo(purifierInfo: JsonObject): ParsedInfo {
  const parsed: ParsedInfo = {
    deviceInfo: {},
    mcuInfo: {},
    networkInfo: {},
    sensorInfo: {},
    statusInfo: {},
    aqGrade: null,
    filterInfo: {},
    timerInfo: null,
  };

  for (const data of purifierInfo.coreData ?? []) {
    const inner = data.data ?? {};
    if ("currentMcuVer" in inner) {
      parsed.mcuInfo = inner;
    }
    if ("sensorInfo" in inner) {
      parsed.sensorInfo = inner.sensorInfo?.attributes ?? {};
    }
  }

  if ("deviceStatusData" in purifierInfo) {
    parsed.statusInfo =
      purifierInfo.deviceStatusData?.data?.statusInfo?.attributes ?? {};
  }

  if ("baseInfoForModelCodeData" in purifierInfo) {
    parsed.deviceInfo =
      purifierInfo.baseInfoForModelCodeData?.deviceInfo ?? {};
  }

  if ("deviceModule" in purifierInfo) {
    const moduleDetail =
      purifierInfo.deviceModule?.data?.content?.deviceModuleDetailInfo ?? {};
    parsed.networkInfo = moduleDetail;
    parsed.aqGrade = moduleDetail.airStatusInfo ?? null;
  }

  return parsed;
}

/**
 * Extract MCU version and lux sensor from HTML-parsed purifier data.
 * These two data points are only available from the legacy HTML page
 * scrape and not from the IoT JSON API.
 */
export function extractHtmlSupplements(
  purifierInfo: JsonObject,
): { mcuVersion: string | null; lux: number | null } {
  let mcuVersion: string | null = null;
  let lux: number | null = null;

  for (const data of purifierInfo.coreData ?? []) {
    const inner = data.data ?? {};
    if ("currentMcuVer" in inner) {
      mcuVersion = inner.currentMcuVer as string;
    }
    if ("sensorInfo" in inner) {
      const attrs = inner.sensorInfo?.attributes ?? {};
      const rawLux = attrs[SensorCode.LUX];
      if (rawLux != null) {
        const parsed = Number(rawLux);
        if (!Number.isNaN(parsed)) {
          lux = parsed;
        }
      }
    }
  }

  return { mcuVersion, lux };
}

/**
 * Parse the iocareapi control status response into statusInfo.
 * Control endpoint returns codes as string values — convert them to numbers.
 */
export function parseControlStatus(data: JsonObject): JsonObject {
  const controlStatus = data?.controlStatus ?? {};
  const result: JsonObject = {};
  for (const [key, value] of Object.entries(controlStatus)) {
    const num = Number(value);
    result[key] = Number.isNaN(num) ? value : num;
  }
  return result;
}

/**
 * Parse the iocareapi air/home response into sensor info and network status.
 * Maps named IAQ fields to internal sensor keys via IAQ_FIELD_MAP.
 */
export function parseAirHome(data: JsonObject): {
  sensorInfo: JsonObject;
  networkInfo: JsonObject;
  aqGrade: JsonObject | null;
} {
  const iaq = data?.IAQ ?? {};
  const netStatus = data?.netStatus ?? {};

  const sensorInfo: JsonObject = {};

  // Map named IAQ fields to sensor keys via IAQ_FIELD_MAP
  for (const [iaqField, sensorKey] of Object.entries(IAQ_FIELD_MAP)) {
    const value = iaq[iaqField];
    if (value != null && value !== "") {
      const num = Number(value);
      if (!Number.isNaN(num)) {
        sensorInfo[sensorKey] = num;
      }
    }
  }

  // iaqIndex is mapped separately (not in IAQ_FIELD_MAP, matches pycoway behavior)
  if (iaq.iaqIndex != null && iaq.iaqIndex !== "") {
    sensorInfo[SensorKey.IAQ] = Number(iaq.iaqIndex);
  }

  // Network info
  const networkInfo: JsonObject = {};
  if (netStatus && typeof netStatus === "object") {
    if ("isOnline" in netStatus) {
      networkInfo.wifiConnected = netStatus.isOnline === "Y" || netStatus.isOnline === true;
    } else if ("netStatus" in netStatus) {
      networkInfo.wifiConnected = netStatus.netStatus === "online";
    }
  }

  // AQ grade
  let aqGrade: JsonObject | null = null;
  if (iaq.iaqGrade != null && iaq.iaqGrade !== "") {
    aqGrade = { iaqGrade: Number(iaq.iaqGrade) };
  }

  return { sensorInfo, networkInfo, aqGrade };
}

/**
 * Build a ParsedInfo from iocareapi JSON responses (control + air/home).
 * Replaces the HTML scraping → extractParsedInfo path.
 */
export function buildParsedInfoFromJson(
  controlData: JsonObject,
  airData: JsonObject,
  userDevice: UserDeviceInfo | null = null,
): ParsedInfo {
  const statusInfo = parseControlStatus(controlData);
  const { sensorInfo, networkInfo, aqGrade } = parseAirHome(airData);

  const deviceInfo: JsonObject = {};
  if (userDevice) {
    deviceInfo.prodName = userDevice.prodName;
    deviceInfo.productName = userDevice.prodName;
  }

  return {
    deviceInfo,
    mcuInfo: {},
    networkInfo,
    sensorInfo,
    statusInfo,
    aqGrade,
    filterInfo: {},
    timerInfo: null,
  };
}

/** Organise raw filter list into a dict keyed by filter type. */
export function buildFilterDict(
  filterInfo: FilterSupply[],
): Partial<Record<"pre-filter" | "max2" | "odor-filter", FilterSupply>> {
  const result: Partial<Record<"pre-filter" | "max2" | "odor-filter", FilterSupply>> = {};
  for (const devFilter of filterInfo) {
    const filterName = String(devFilter.supplyNm ?? "").toLowerCase();
    if (filterName === "pre-filter") {
      result["pre-filter"] = devFilter;
    } else if (filterName === "max2 filter" || filterName === "max2") {
      result["max2"] = devFilter;
    } else if (
      ["deodor filter", "odor filter", "deodorization filter"].includes(
        filterName,
      )
    ) {
      result["odor-filter"] = devFilter;
    }
  }
  return result;
}

/** Extract plain text from the supply HTML content snippet. */
function parseSupplyDescription(htmlContent: string): string | null {
  if (!htmlContent) return null;
  const $ = cheerio.load(htmlContent);
  const text = $.text().trim();
  return text || null;
}

/** Build a list of FilterInfo objects from raw supply data. */
export function buildFilterInfoList(filterInfo: FilterSupply[]): FilterInfo[] {
  return filterInfo.map((supply) => {
    const pollutants = (supply.pollutions ?? [])
      .map((pollution) => pollution.pollutionNm)
      .filter((pollutionName): pollutionName is string => Boolean(pollutionName));

    return {
      name: supply.supplyNm ?? null,
      filterRemain: supply.filterRemain ?? null,
      filterRemainStatus: supply.filterRemainStatus ?? null,
      replaceCycle: supply.replaceCycle ?? null,
      replaceCycleUnit: supply.replaceCycleUnit ?? null,
      lastDate: supply.lastDate || null,
      nextDate: supply.nextDate || null,
      pollutants,
      description: parseSupplyDescription(supply.supplyContent ?? ""),
      preFilter: supply.preFilterYn === "Y",
      serverReset: supply.serverResetFilterYn === "Y",
    };
  });
}

/** Compute filter % remaining from sensor data, or null if unavailable. */
function sensorFilterPct(
  sensorInfo: JsonObject,
  key: string,
): number | null {
  if (key in sensorInfo) {
    return 100 - (sensorInfo[key] as number);
  }
  return null;
}

/** Construct a CowayPurifier from parsed API data. */
export function buildPurifier(
  dev: PurifierDeviceSummary,
  parsedInfo: ParsedInfo,
  rawFilters: FilterSupply[] | null = null,
): CowayPurifier {
  const { deviceInfo, statusInfo: status, sensorInfo: sensor, filterInfo: filters } = parsedInfo;

  const deviceAttr: DeviceAttributes = {
    deviceId: dev.deviceSerial != null ? String(dev.deviceSerial) : null,
    model: deviceInfo.productName != null ? String(deviceInfo.productName) : null,
    modelCode: dev.productModel != null ? String(dev.productModel) : null,
    code: deviceInfo.modelCode != null ? String(deviceInfo.modelCode) : null,
    name: dev.dvcNick != null ? String(dev.dvcNick) : null,
    productName: deviceInfo.prodName != null ? String(deviceInfo.prodName) : null,
    placeId: dev.placeId != null ? String(dev.placeId) : null,
  };

  const networkStatus =
    (parsedInfo.networkInfo.wifiConnected as boolean | undefined) ?? null;

  // Filter percentages
  let preFilterPct: number | null;
  let preFilterChangeFrequency: number | null = null;
  let max2Pct: number | null;

  if (Object.keys(filters).length > 0) {
    if ("pre-filter" in filters) {
      preFilterPct = (filters["pre-filter"].filterRemain as number) ?? null;
      preFilterChangeFrequency =
        (filters["pre-filter"].replaceCycle as number) ?? null;
    } else {
      preFilterPct = sensorFilterPct(sensor, SensorCode.PRE_FILTER_USAGE);
    }
    max2Pct =
      "max2" in filters
        ? ((filters.max2.filterRemain as number) ?? null)
        : sensorFilterPct(sensor, SensorCode.MAX2_FILTER_USAGE);
  } else {
    preFilterPct = sensorFilterPct(sensor, SensorCode.PRE_FILTER_USAGE);
    max2Pct = sensorFilterPct(sensor, SensorCode.MAX2_FILTER_USAGE);
  }

  const odorFilterPct =
    "odor-filter" in filters
      ? ((filters["odor-filter"].filterRemain as number) ?? null)
      : sensorFilterPct(sensor, SensorCode.ODOR_FILTER_USAGE);

  // Air quality readings
  const pm25 =
    (sensor[SensorCode.PM25] as number | undefined) ??
    (sensor[SensorKey.PM25] as number | undefined) ??
    null;
  const pm10 =
    (sensor[SensorCode.PM10] as number | undefined) ??
    (sensor[SensorKey.PM10] as number | undefined) ??
    null;

  const modeValue = status["0002"] as number | undefined;

  return {
    deviceAttr,
    mcuVersion: (parsedInfo.mcuInfo.currentMcuVer as string) ?? null,
    networkStatus,
    isOn: status["0001"] === 1,
    autoMode: modeValue === 1,
    ecoMode: modeValue === 6,
    nightMode: modeValue === 2,
    rapidMode: modeValue === 5,
    fanSpeed: (status["0003"] as number) ?? null,
    lightOn: status["0007"] === 2,
    lightMode: (status["0007"] as number) ?? null,
    buttonLock: (status["0024"] as number) ?? null,
    timer: parsedInfo.timerInfo,
    timerRemaining: (status["0008"] as number) ?? null,
    preFilterPct,
    max2Pct,
    odorFilterPct,
    aqGrade: parsedInfo.aqGrade?.iaqGrade ?? null,
    particulateMatter2_5: pm25,
    particulateMatter10: pm10,
    carbonDioxide: (sensor[SensorKey.CO2] as number) ?? null,
    volatileOrganicCompounds: (sensor[SensorKey.VOCS] as number) ?? null,
    airQualityIndex: (sensor[SensorKey.IAQ] as number) ?? null,
    luxSensor: (sensor[SensorCode.LUX] as number) ?? null,
    preFilterChangeFrequency,
    smartModeSensitivity: (status["000A"] as number) ?? null,
    filters: rawFilters ? buildFilterInfoList(rawFilters) : null,
  };
}

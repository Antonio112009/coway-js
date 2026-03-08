/** Data-fetching layer for Coway IoCare purifiers. */

import {
  CATEGORY_NAME,
  Endpoint,
  Header,
  IocareApi,
  SensorCode,
  TrCode,
} from "../constants.js";
import {
  AuthError,
  CowayError,
  NoPurifiers,
} from "../errors.js";
import {
  CowayMaintenanceClient,
} from "../account/maintenance.js";
import type {
  CowayPurifier,
  FilterSupply,
  PurifierData,
  PurifierDeviceSummary,
  PurifierTimerInfo,
  UserDeviceInfo,
} from "./models.js";
import {
  buildFilterDict,
  buildParsedInfoFromJson,
  buildPurifier,
  extractHtmlSupplements,
  parsePurifierHtml,
} from "./parser.js";
import type { JsonObject } from "../types.js";

export class CowayDataClient extends CowayMaintenanceClient {
  /** Get all purifiers linked to Coway account. */
  async asyncGetPurifiers(): Promise<PurifierDeviceSummary[]> {
    if (!this.places) {
      await this.login();
    }

    const params: Record<string, string> = {
      pageIndex: "0",
      pageSize: "100",
    };
    let headers = await this.createEndpointHeader();

    const activePlaces = (this.places ?? []).filter(
      (place) => place.deviceCnt !== 0,
    );

    const fetchPlace = async (
      place: { placeId: string; deviceCnt: number },
    ): Promise<PurifierDeviceSummary[]> => {
      const url = `${Endpoint.BASE_URI}${Endpoint.PLACES}/${place.placeId}/devices`;
      const response = await this.getEndpoint(url, headers, params);

      if ("error" in response) {
        throw new CowayError(
          `Failed to get devices for Place ID: ${place.placeId}. Response: ${JSON.stringify(response.error)}`,
        );
      }

      const devices = response.data?.content as PurifierDeviceSummary[] | undefined;
      if (!devices) return [];
      // API may return placeId/deviceSerial as numbers — coerce to strings
      return devices
        .filter((device) => device.categoryName === CATEGORY_NAME)
        .map((device) => ({
          ...device,
          placeId: String(device.placeId),
          deviceSerial: String(device.deviceSerial),
          modelCode: String(device.modelCode),
          productModel: String(device.productModel),
        }));
    };

    try {
      const results = await Promise.all(activePlaces.map(fetchPlace));
      return results.flat();
    } catch (err) {
      if (err instanceof AuthError) {
        await this.login();
        headers = await this.createEndpointHeader();
        const results = await Promise.all(activePlaces.map(fetchPlace));
        return results.flat();
      }
      throw err;
    }
  }

  /** Return PurifierData with all Purifier Devices. */
  async asyncGetPurifiersData(): Promise<PurifierData> {
    if (!this.places) {
      await this.login();
    }

    const purifiers = await this.asyncGetPurifiers();
    if (!purifiers.length) {
      throw new NoPurifiers(
        `No purifiers found for any IoCare+ places associated with ${this.username}.`,
      );
    }

    this.checkToken = false;

    try {
      await this.asyncServerMaintenanceNotice();

      // Fetch rich device metadata from iocareapi (matched by serial)
      const userDeviceMap = await this.asyncFetchUserDeviceMap();

      const deviceData: Record<string, CowayPurifier> = {};

      const results = await Promise.all(
        purifiers.map(async (dev) => {
          const nick = dev.dvcNick as string;
          const userDevice = userDeviceMap.get(dev.deviceSerial) ?? null;

          const [controlData, airData, filterInfo, timer] = await Promise.all([
            this.asyncFetchControlStatus(dev.deviceSerial, userDevice),
            this.asyncFetchAirHome(dev.deviceSerial, userDevice),
            this.asyncFetchFilterStatus(
              dev.placeId,
              dev.deviceSerial,
              nick,
            ),
            this.asyncFetchTimer(dev.deviceSerial, nick),
          ]);

          const parsedInfo = buildParsedInfoFromJson(controlData, airData, userDevice);
          parsedInfo.filterInfo = buildFilterDict(filterInfo);
          parsedInfo.timerInfo = timer.offTimer ?? null;

          // HTML scrape for MCU version + lux sensor (not in IoT API).
          const modelCode = String(dev.modelCode ?? dev.productModel ?? "");
          const placeId = String(dev.placeId);
          const serial = dev.deviceSerial;
          try {
            const html = await this.getPurifierHtml(nick, serial, modelCode, placeId);
            const purifierInfo = parsePurifierHtml(html);
            if (purifierInfo) {
              const supplements = extractHtmlSupplements(purifierInfo);
              if (supplements.mcuVersion) {
                parsedInfo.mcuInfo = { currentMcuVer: supplements.mcuVersion };
              }
              if (supplements.lux != null) {
                parsedInfo.sensorInfo[SensorCode.LUX] = supplements.lux;
              }
            }
          } catch {
            // HTML supplement fetch failed — skip MCU/lux
          }

          return { dev, parsedInfo, filterInfo };
        }),
      );

      for (const entry of results) {
        const purifier = buildPurifier(entry.dev, entry.parsedInfo, entry.filterInfo);
        const id = purifier.deviceAttr.deviceId;
        if (id) deviceData[id] = purifier;
      }

      return { purifiers: deviceData };
    } finally {
      this.checkToken = true;
    }
  }

  /** Fetch user devices from iocareapi and return a map keyed by serial. */
  async asyncFetchUserDeviceMap(): Promise<Map<string, UserDeviceInfo>> {
    if (this.checkToken) {
      await this._checkToken();
    }

    const params = { pageIndex: "0", pageSize: "100" };
    const response = await this.getIocareApiEndpoint(
      IocareApi.USER_DEVICES,
      TrCode.USER_DEVICES,
      params,
    );

    const map = new Map<string, UserDeviceInfo>();

    if ("error" in response) return map;

    const devices = response.data?.deviceInfos as JsonObject[] | undefined;
    if (!Array.isArray(devices)) return map;

    for (const d of devices) {
      const serial = String(d.barcode ?? d.dvcSerial ?? "");
      if (!serial) continue;
      const info: UserDeviceInfo = {
        barcode: serial,
        dvcBrandCd: String(d.dvcBrandCd ?? ""),
        dvcTypeCd: String(d.dvcTypeCd ?? ""),
        prodName: String(d.prodName ?? ""),
        ordNo: String(d.ordNo ?? ""),
        admdongCd: String(d.admdongCd ?? ""),
        stationCd: String(d.stationCd ?? ""),
        resetDttm: String(d.resetDttm ?? ""),
        membershipYn: String(d.membershipYn ?? ""),
        selfManageYn: String(d.selfManageYn ?? ""),
        sellTypeCd: String(d.sellTypeCd ?? ""),
      };
      if (d.dvcNick != null) info.dvcNick = String(d.dvcNick);
      if (d.dvcSerial != null) info.dvcSerial = String(d.dvcSerial);
      map.set(serial, info);
    }

    return map;
  }

  /** Fetch control status from iocareapi (replaces HTML status scraping). */
  async asyncFetchControlStatus(
    devId: string,
    userDevice: UserDeviceInfo | null,
  ): Promise<JsonObject> {
    if (this.checkToken) {
      await this._checkToken();
    }

    const params: Record<string, string> = {
      devId,
      mqttDevice: "true",
    };
    if (userDevice) {
      params.dvcBrandCd = userDevice.dvcBrandCd;
      params.dvcTypeCd = userDevice.dvcTypeCd;
      params.prodName = userDevice.prodName;
    }

    const path = `${IocareApi.DEVICE_CONTROL}/${devId}/control`;
    const response = await this.getIocareApiEndpoint(path, TrCode.CONTROL_STATUS, params);

    if ("error" in response) {
      throw new CowayError(
        `Failed to get control status for device ${devId}: ${JSON.stringify(response.error)}`,
      );
    }

    return (response.data as JsonObject) ?? {};
  }

  /** Fetch air quality / home data from iocareapi (replaces HTML sensor scraping). */
  async asyncFetchAirHome(
    devId: string,
    userDevice: UserDeviceInfo | null,
  ): Promise<JsonObject> {
    if (this.checkToken) {
      await this._checkToken();
    }

    const params: Record<string, string> = {
      mqttDevice: "true",
    };
    if (userDevice) {
      params.barcode = userDevice.barcode;
      params.dvcBrandCd = userDevice.dvcBrandCd;
      params.prodName = userDevice.prodName;
      params.admdongCd = userDevice.admdongCd;
      params.stationCd = userDevice.stationCd;
      params.zipCode = "";
      params.resetDttm = userDevice.resetDttm;
      params.deviceType = userDevice.dvcTypeCd;
      params.orderNo = userDevice.ordNo;
      params.membershipYn = userDevice.membershipYn;
      params.selfYn = userDevice.selfManageYn;
    }

    const path = `${IocareApi.AIR_HOME}/${devId}/home`;
    const response = await this.getIocareApiEndpoint(path, TrCode.AIR_HOME, params);

    if ("error" in response) {
      throw new CowayError(
        `Failed to get air home data for device ${devId}: ${JSON.stringify(response.error)}`,
      );
    }

    return (response.data as JsonObject) ?? {};
  }

  /** Fetch Pre-filter and MAX2 filter states. */
  async asyncFetchFilterStatus(
    placeId: string,
    serial: string,
    name: string,
  ): Promise<FilterSupply[]> {
    if (this.checkToken) {
      await this._checkToken();
    }

    const url = `${Endpoint.SECONDARY_BASE}${Endpoint.PLACES}/${placeId}/devices/${serial}/supplies`;
    const headers: Record<string, string> = {
      region: "NUS",
      accept: "application/json, text/plain, */*",
      authorization: `Bearer ${this.accessToken}`,
      "accept-language": Header.COWAY_LANGUAGE,
      "user-agent": Header.HTML_USER_AGENT,
    };
    const params: Record<string, string> = {
      membershipYn: "N",
      membershipType: "",
      langCd: Header.ACCEPT_LANG,
    };

    const response = await this.getEndpoint(url, headers, params);
    if ("error" in response) {
      throw new CowayError(
        `Failed to get filter status for purifier ${name}: ${JSON.stringify(response.error)}`,
      );
    }
    return (response.data?.suppliesList as FilterSupply[]) ?? [];
  }

  /** Get the current timer setting. */
  async asyncFetchTimer(
    serial: string,
    name: string,
  ): Promise<PurifierTimerInfo> {
    if (this.checkToken) {
      await this._checkToken();
    }

    const url = `${Endpoint.SECONDARY_BASE}${Endpoint.AIR}/${serial}/timer`;
    const headers: Record<string, string> = {
      region: "NUS",
      accept: "application/json, text/plain, */*",
      authorization: `Bearer ${this.accessToken}`,
      "accept-language": Header.COWAY_LANGUAGE,
      "user-agent": Header.HTML_USER_AGENT,
    };

    const response = await this.getEndpoint(url, headers, null);
    if ("error" in response) {
      throw new CowayError(
        `Failed to get timer for purifier ${name}: ${JSON.stringify(response.error)}`,
      );
    }
    return (response.data as PurifierTimerInfo | undefined) ?? { offTimer: null };
  }

  /** Fetch device connection status via the IoT JSON API. */
  async asyncFetchDeviceConn(
    devId: string,
    userDevice: UserDeviceInfo | null,
  ): Promise<JsonObject> {
    if (this.checkToken) {
      await this._checkToken();
    }

    const params: Record<string, string> = {
      devId,
      mqttDevice: "true",
    };
    if (userDevice) {
      params.dvcBrandCd = userDevice.dvcBrandCd;
      params.dvcTypeCd = userDevice.dvcTypeCd;
      params.prodName = userDevice.prodName;
    }

    const response = await this.getIocareApiEndpoint(
      IocareApi.DEVICE_CONN,
      TrCode.DEVICE_CONN,
      params,
    );

    if ("error" in response) {
      throw new CowayError(
        `Failed to get device connection for ${devId}: ${JSON.stringify(response.error)}`,
      );
    }

    return (response.data as JsonObject) ?? {};
  }
}

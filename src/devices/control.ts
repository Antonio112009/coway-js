/** Purifier control commands for Coway IoCare API. */

import {
  CommandCode,
  Endpoint,
  PREFILTER_CYCLE,
  type LightModeValue,
} from "../constants.js";
import { CowayError } from "../errors.js";
import type { JsonObject } from "../types.js";
import type { DeviceAttributes } from "./models.js";
import { CowayDataClient } from "./data.js";

export class CowayControlClient extends CowayDataClient {
  private getRequiredControlIdentifiers(
    deviceAttr: DeviceAttributes,
  ): { deviceId: string; placeId: string } {
    const { deviceId, placeId } = deviceAttr;

    if (!deviceId || !placeId) {
      throw new CowayError(
        "DeviceAttributes.deviceId and DeviceAttributes.placeId are required for control requests.",
      );
    }

    return { deviceId, placeId };
  }

  private validateControlResponse(
    response: JsonObject | string,
    commandName: string,
  ): void {
    if (typeof response === "object" && response !== null) {
      const header = response.header ?? {};
      if ("error_code" in header) {
        throw new CowayError(
          `Failed to execute ${commandName} command. ` +
            `Error code: ${header.error_code}, ` +
            `Error message: ${header.error_text}`,
        );
      }
    } else {
      throw new CowayError(
        `Failed to execute ${commandName} command. Response: ${response}`,
      );
    }
  }

  private async sendControl(
    deviceAttr: DeviceAttributes,
    command: string,
    value: string,
    commandName: string,
  ): Promise<void> {
    const response = await this.asyncControlPurifier(
      deviceAttr,
      command,
      value,
    );
    this.validateControlResponse(response, commandName);
  }

  /** Provide isOn as true for On and false for Off. */
  async asyncSetPower(
    deviceAttr: DeviceAttributes,
    isOn: boolean,
  ): Promise<void> {
    await this.sendControl(
      deviceAttr,
      CommandCode.POWER,
      isOn ? "1" : "0",
      "power",
    );
  }

  /** Set Purifier to Auto Mode. */
  async asyncSetAutoMode(deviceAttr: DeviceAttributes): Promise<void> {
    await this.sendControl(deviceAttr, CommandCode.MODE, "1", "auto mode");
  }

  /** Set Purifier to Night Mode. */
  async asyncSetNightMode(deviceAttr: DeviceAttributes): Promise<void> {
    await this.sendControl(deviceAttr, CommandCode.MODE, "2", "night mode");
  }

  /** Set Purifier to Eco Mode. Only applies to AIRMEGA AP-1512HHS models. */
  async asyncSetEcoMode(deviceAttr: DeviceAttributes): Promise<void> {
    await this.sendControl(deviceAttr, CommandCode.MODE, "6", "eco mode");
  }

  /** Set Purifier to Rapid Mode. Only applies to AIRMEGA 250s. */
  async asyncSetRapidMode(deviceAttr: DeviceAttributes): Promise<void> {
    await this.sendControl(deviceAttr, CommandCode.MODE, "5", "rapid mode");
  }

  /** Speed can be "1", "2", or "3". */
  async asyncSetFanSpeed(
    deviceAttr: DeviceAttributes,
    speed: "1" | "2" | "3",
  ): Promise<void> {
    if (!["1", "2", "3"].includes(speed)) {
      throw new CowayError(
        `Invalid fan speed '${speed}'. Must be '1', '2', or '3'.`,
      );
    }
    await this.sendControl(
      deviceAttr,
      CommandCode.FAN_SPEED,
      speed,
      "fan speed",
    );
  }

  /** Provide lightOn as true for On and false for Off. NOT used for 250s purifiers. */
  async asyncSetLight(
    deviceAttr: DeviceAttributes,
    lightOn: boolean,
  ): Promise<void> {
    await this.sendControl(
      deviceAttr,
      CommandCode.LIGHT,
      lightOn ? "2" : "0",
      "light",
    );
  }

  /** Sets light mode for purifiers that support more than On/Off. */
  async asyncSetLightMode(
    deviceAttr: DeviceAttributes,
    lightMode: LightModeValue,
  ): Promise<void> {
    await this.sendControl(
      deviceAttr,
      CommandCode.LIGHT,
      lightMode,
      "light mode",
    );
  }

  /** Time in minutes: "0", "60", "120", "240", or "480". "0" = off. */
  async asyncSetTimer(
    deviceAttr: DeviceAttributes,
    time: "0" | "60" | "120" | "240" | "480",
  ): Promise<void> {
    await this.sendControl(deviceAttr, CommandCode.TIMER, time, "set timer");
  }

  /** Sensitivity: "1" = Sensitive, "2" = Moderate, "3" = Insensitive. */
  async asyncSetSmartModeSensitivity(
    deviceAttr: DeviceAttributes,
    sensitivity: "1" | "2" | "3",
  ): Promise<void> {
    await this.sendControl(
      deviceAttr,
      CommandCode.SMART_SENSITIVITY,
      sensitivity,
      "smart mode sensitivity",
    );
  }

  /** Set button lock to ON ("1") or OFF ("0"). */
  async asyncSetButtonLock(
    deviceAttr: DeviceAttributes,
    value: "0" | "1",
  ): Promise<void> {
    await this.sendControl(
      deviceAttr,
      CommandCode.BUTTON_LOCK,
      value,
      "button lock",
    );
  }

  /** Execute an individual purifier control command. */
  async asyncControlPurifier(
    deviceAttr: DeviceAttributes,
    command: string,
    value: string,
  ): Promise<JsonObject | string> {
    const { deviceId, placeId } = this.getRequiredControlIdentifiers(deviceAttr);

    await this._checkToken();

    const url =
      `${Endpoint.BASE_URI}${Endpoint.PLACES}/` +
      `${placeId}/devices/` +
      `${deviceId}/control-status`;
    const headers = this.constructControlHeader();
    const data = {
      attributes: { [command]: value },
      isMultiControl: false,
      refreshFlag: false,
    };

    const resp = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(data),
      signal: AbortSignal.timeout(this.timeout),
    });

    return this.controlCommandResponse(resp);
  }

  /** Change pre-filter wash frequency. Value can be 2, 3, or 4. */
  async asyncChangePrefilterSetting(
    deviceAttr: DeviceAttributes,
    value: 2 | 3 | 4,
  ): Promise<void> {
    const { deviceId, placeId } = this.getRequiredControlIdentifiers(deviceAttr);

    await this._checkToken();

    const url =
      `${Endpoint.BASE_URI}${Endpoint.PLACES}/` +
      `${placeId}/devices/` +
      `${deviceId}/control-param`;
    const headers = this.constructControlHeader();

    if (!(value in PREFILTER_CYCLE)) {
      throw new CowayError(
        `Invalid prefilter value '${value}'. Must be one of ${Object.keys(PREFILTER_CYCLE).join(", ")}.`,
      );
    }

    const cycle = PREFILTER_CYCLE[value];
    const data = {
      attributes: { [CommandCode.PREFILTER]: cycle },
      deviceSerial: deviceId,
      placeId,
      refreshFlag: false,
    };

    const resp = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(data),
      signal: AbortSignal.timeout(this.timeout),
    });

    const response = await this.controlCommandResponse(resp);
    this.validateControlResponse(response, "prefilter");
  }
}

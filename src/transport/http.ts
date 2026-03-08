/** HTTP base client for Coway IoCare API. */

import {
  Endpoint,
  ErrorMessages,
  Header,
  IocareApi,
  Parameter,
  TIMEOUT,
} from "../constants.js";
import {
  AuthError,
  CowayError,
  ServerMaintenance,
} from "../errors.js";
import type { JsonObject } from "../types.js";

export interface CowayHttpClientOptions {
  timeout?: number;
}

export class CowayHttpClient {
  protected timeout: number;
  protected accessToken: string | null = null;

  constructor(options: CowayHttpClientOptions = {}) {
    this.timeout = options.timeout ?? TIMEOUT;
  }

  async close(): Promise<void> {
    // No persistent connections to clean up with fetch API
  }

  protected async postEndpoint(data: Record<string, string>): Promise<JsonObject> {
    const url = `${Endpoint.BASE_URI}${Endpoint.GET_TOKEN}`;
    const headers: Record<string, string> = {
      "content-type": Header.CONTENT_JSON,
      "user-agent": Header.COWAY_USER_AGENT,
      "accept-language": Header.COWAY_LANGUAGE,
    };

    const resp = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(data),
      signal: AbortSignal.timeout(this.timeout),
    });

    return this.parseResponse(resp);
  }

  protected async getEndpoint(
    endpoint: string,
    headers: Record<string, string>,
    params: Record<string, string> | null,
  ): Promise<JsonObject> {
    let url = endpoint;
    if (params) {
      const searchParams = new URLSearchParams(params);
      url = `${endpoint}?${searchParams.toString()}`;
    }

    const resp = await fetch(url, {
      method: "GET",
      headers,
      signal: AbortSignal.timeout(this.timeout),
    });

    return this.parseResponse(resp);
  }

  protected constructControlHeader(): Record<string, string> {
    return {
      "Content-Type": Header.CONTENT_JSON,
      Accept: "*/*",
      "accept-language": Header.COWAY_LANGUAGE,
      "User-Agent": Header.COWAY_USER_AGENT,
      authorization: `Bearer ${this.accessToken}`,
      region: "NUS",
    };
  }

  protected constructIocareApiHeader(trCode: string): Record<string, string> {
    return {
      "Content-Type": Header.CONTENT_JSON,
      "User-Agent": Header.COWAY_USER_AGENT,
      trcode: trCode,
      profile: "prod",
      Authorization: `Bearer ${this.accessToken}`,
    };
  }

  protected async getIocareApiEndpoint(
    path: string,
    trCode: string,
    params: Record<string, string> | null,
  ): Promise<JsonObject> {
    const url = `${IocareApi.BASE}${path}`;
    const headers = this.constructIocareApiHeader(trCode);
    return this.getEndpoint(url, headers, params);
  }

  protected async getPurifierHtml(
    nickName: string,
    serial: string,
    modelCode: string,
    placeId: string,
  ): Promise<string> {
    const url = `${Endpoint.PURIFIER_HTML_BASE}/${placeId}/product/${modelCode}`;
    const headers: Record<string, string> = {
      theme: Header.THEME,
      callingpage: Header.CALLING_PAGE,
      accept: Header.ACCEPT,
      dvcnick: nickName,
      timezoneid: Parameter.TIMEZONE,
      appversion: Parameter.APP_VERSION,
      accesstoken: this.accessToken ?? "",
      "accept-language": Header.COWAY_LANGUAGE,
      region: "NUS",
      "user-agent": Header.HTML_USER_AGENT,
      srcpath: Header.SOURCE_PATH,
      deviceserial: serial,
    };
    const params = new URLSearchParams({
      bottomSlide: "false",
      tab: "0",
      temperatureUnit: "F",
      weightUnit: "oz",
      gravityUnit: "lb",
    });

    const resp = await fetch(`${url}?${params.toString()}`, {
      method: "GET",
      headers,
      signal: AbortSignal.timeout(this.timeout),
    });

    return resp.text();
  }

  protected async parseResponse(resp: Response): Promise<JsonObject> {
    if (resp.status !== 200) {
      const errorText = await resp.text();
      let errorJson: JsonObject;
      try {
        errorJson = JSON.parse(errorText);
      } catch {
        throw new CowayError(`Could not parse JSON: ${errorText}`);
      }

      if ("error" in errorJson) {
        return { error: errorJson };
      }

      const message = errorJson.message as string | undefined;
      if (message === ErrorMessages.BAD_TOKEN) {
        throw new AuthError(
          `Coway Auth error: Coway IoCare authentication failed; ${ErrorMessages.BAD_TOKEN}`,
        );
      }
      if (message === ErrorMessages.EXPIRED_TOKEN) {
        return { error: ErrorMessages.EXPIRED_TOKEN };
      }
      return { error: errorJson };
    }

    let response: JsonObject;
    try {
      response = (await resp.json()) as JsonObject;
    } catch {
      throw new CowayError("Could not parse JSON response");
    }

    if (response.data && response.data.maintainInfos) {
      throw new ServerMaintenance(
        "Coway Servers are undergoing maintenance.",
      );
    }

    if ("error" in response) {
      if (response.error.message === ErrorMessages.INVALID_REFRESH_TOKEN) {
        throw new AuthError(
          `Coway Auth error: Coway IoCare authentication failed: ${ErrorMessages.INVALID_REFRESH_TOKEN}`,
        );
      }
      throw new CowayError(
        `Coway error message: ${response.error.message}`,
      );
    }

    return response;
  }

  protected async controlCommandResponse(
    resp: Response,
  ): Promise<JsonObject | string> {
    const text = await resp.text();
    let response: JsonObject;
    try {
      response = JSON.parse(text) as JsonObject;
    } catch {
      return text;
    }

    if (resp.status !== 200) {
      return JSON.stringify(response);
    }

    if (response.data?.maintainInfos) {
      throw new ServerMaintenance(
        "Coway Servers are undergoing maintenance.",
      );
    }

    return response;
  }
}

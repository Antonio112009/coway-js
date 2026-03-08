/** Authentication layer for Coway IoCare API. */

import * as cheerio from "cheerio";

import {
  TIMEOUT,
  Endpoint,
  ErrorMessages,
  Header,
  Parameter,
} from "../constants.js";
import {
  AuthError,
  CowayError,
  NoPlaces,
  PasswordExpired,
  RateLimited,
  ServerMaintenance,
} from "../errors.js";
import { CowayHttpClient } from "../transport/http.js";

interface PlaceSummary {
  deviceCnt: number;
  placeId: string;
}

export interface CowayAuthClientOptions {
  username: string;
  password: string;
  timeout?: number;
  skipPasswordChange?: boolean;
}

export class CowayAuthClient extends CowayHttpClient {
  protected username: string;
  protected password: string;
  protected skipPasswordChange: boolean;
  protected refreshToken: string | null = null;
  protected tokenExpiration: Date | null = null;
  protected countryCode: string | null = null;
  protected places: PlaceSummary[] | null = null;
  protected checkToken = true;

  constructor(options: CowayAuthClientOptions) {
    super({ timeout: options.timeout ?? TIMEOUT });
    this.username = options.username;
    this.password = options.password;
    this.skipPasswordChange = options.skipPasswordChange ?? false;
  }

  // ------------------------------------------------------------------
  // OAuth / login helpers
  // ------------------------------------------------------------------

  private async getOAuthPage(
    url: string,
  ): Promise<{ response: Response; html: string }> {
    const headers: Record<string, string> = {
      "user-agent": Header.USER_AGENT,
      accept: Header.ACCEPT,
      "accept-language": Header.ACCEPT_LANG,
    };
    const params = new URLSearchParams({
      auth_type: "0",
      response_type: "code",
      client_id: Parameter.CLIENT_ID,
      redirect_uri: Endpoint.REDIRECT_URL,
      ui_locales: "en",
    });

    const response = await fetch(`${url}?${params.toString()}`, {
      method: "GET",
      headers,
      redirect: "follow",
      signal: AbortSignal.timeout(this.timeout),
    });

    const html = await response.text();
    return { response, html };
  }

  private async postAuth(
    url: string,
    cookies: string,
    headers: Record<string, string>,
    data: Record<string, string>,
  ): Promise<{ result: Response | string; passwordSkip: boolean }> {
    const body = new URLSearchParams(data).toString();

    const response = await fetch(url, {
      method: "POST",
      headers: {
        ...headers,
        ...(cookies ? { cookie: cookies } : {}),
      },
      body,
      redirect: "follow",
      signal: AbortSignal.timeout(this.timeout),
    });

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html")) {
      return { result: response, passwordSkip: false };
    }

    const htmlPage = await response.text();
    const $ = cheerio.load(htmlPage);
    const titleTag = $("title").first().text();

    if (titleTag === "Coway - Password change message") {
      if (this.skipPasswordChange) {
        const formUrl = $("form#kc-password-change-form").attr("action");
        if (formUrl) {
          return { result: formUrl, passwordSkip: true };
        }
      }
      throw new PasswordExpired(
        "Coway servers are requesting a password change as the " +
          "password on this account hasn't been changed for 60 days or more.",
      );
    }

    const errorMessage = $("p.member_error_msg").text();
    if (errorMessage === "Your ID or password is incorrect.") {
      throw new AuthError(
        "Coway API authentication error: Invalid username/password.",
      );
    }

    return { result: response, passwordSkip: false };
  }

  protected async createEndpointHeader(): Promise<Record<string, string>> {
    if (this.checkToken) {
      await this._checkToken();
    }
    return {
      region: "NUS",
      "content-type": "application/json",
      accept: "*/*",
      authorization: `Bearer ${this.accessToken}`,
      "accept-language": Header.COWAY_LANGUAGE,
      "user-agent": Header.COWAY_USER_AGENT,
    };
  }

  // ------------------------------------------------------------------
  // Login flow
  // ------------------------------------------------------------------

  async login(): Promise<void> {
    const { loginUrl, cookies } = await this.getLoginCookies();
    const authCode = await this.getAuthCode(loginUrl, cookies);
    const tokens = await this.getToken(authCode);
    this.accessToken = tokens.accessToken;
    this.refreshToken = tokens.refreshToken;
    this.tokenExpiration = new Date(Date.now() + 3600 * 1000);
    this.countryCode = await this.getCountryCode();
    this.places = await this.getPlaces();
  }

  private async getLoginCookies(): Promise<{
    loginUrl: string;
    cookies: string;
  }> {
    const { response, html } = await this.getOAuthPage(Endpoint.OAUTH_URL);

    if (response.status !== 200) {
      if (response.status === 503) {
        throw new ServerMaintenance(
          `Coway Servers are undergoing maintenance. Response: ${response.statusText}`,
        );
      }
      throw new CowayError(
        `Coway API error while fetching login page. Status: ${response.status}, Reason: ${response.statusText}`,
      );
    }

    const cookies = response.headers.get("set-cookie") ?? "";
    const $ = cheerio.load(html);
    const loginUrl = $("form#kc-form-login").attr("action");

    if (!loginUrl) {
      throw new CowayError(
        "Coway API error: Coway servers did not return a valid Login URL. Retrying now.",
      );
    }

    return { loginUrl, cookies };
  }

  private async getAuthCode(
    loginUrl: string,
    cookies: string,
  ): Promise<string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": Header.USER_AGENT,
    };
    const data: Record<string, string> = {
      clientName: Parameter.CLIENT_NAME,
      termAgreementStatus: "",
      idp: "",
      username: this.username,
      password: this.password,
      rememberMe: "on",
    };
    const passwordSkipData: Record<string, string> = {
      cmd: "change_next_time",
      checkPasswordNeededYn: "Y",
      current_password: "",
      new_password: "",
      new_password_confirm: "",
    };

    const { result: initialResult, passwordSkip: needsSkip } = await this.postAuth(
      loginUrl,
      cookies,
      headers,
      data,
    );

    let result: Response | string = initialResult;

    if (needsSkip && typeof result === "string") {
      ({ result } = await this.postAuth(
        result,
        cookies,
        headers,
        passwordSkipData,
      ));
    }

    if (typeof result === "string") {
      throw new CowayError("Unexpected string result during auth code retrieval");
    }

    const url = new URL(result.url);
    const code = url.searchParams.get("code");
    if (!code) {
      throw new CowayError("Failed to extract auth code from redirect URL");
    }
    return code;
  }

  private async getToken(
    authCode: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const data = {
      authCode,
      redirectUrl: Endpoint.REDIRECT_URL,
    };

    const response = await this.postEndpoint(data);

    if ("error" in response) {
      if (response.error?.message === ErrorMessages.INVALID_GRANT) {
        throw new RateLimited(
          "Failed fetching Coway access token. The account has likely " +
            "been rate-limited (blocked). Please wait 24 hours before trying again. " +
            "If, after 24 hours, you're unable to log in even with the mobile " +
            "IoCare+ app, please contact Coway support.",
        );
      }
      throw new CowayError(
        `Failed fetching Coway access token: ${response.error?.message}`,
      );
    }

    const accessToken = response.data?.accessToken as string | undefined;
    const refreshToken = response.data?.refreshToken as string | undefined;
    if (accessToken && refreshToken) {
      return { accessToken, refreshToken };
    }

    throw new CowayError(
      `Failed fetching Coway access/refresh token for ${this.username}.`,
    );
  }

  // ------------------------------------------------------------------
  // Token management
  // ------------------------------------------------------------------

  protected async _checkToken(): Promise<void> {
    if (!this.checkToken) return;

    if (!this.accessToken || !this.refreshToken || !this.tokenExpiration) {
      await this.login();
      return;
    }

    const remaining = this.tokenExpiration.getTime() - Date.now();
    if (remaining < 300_000) {
      await this._refreshToken();
    }
  }

  private async _refreshToken(): Promise<void> {
    const headers: Record<string, string> = {
      "content-type": "application/json",
      accept: "*/*",
      "accept-language": Header.COWAY_LANGUAGE,
      "user-agent": Header.COWAY_USER_AGENT,
    };
    const data = { refreshToken: this.refreshToken };
    const url = `${Endpoint.BASE_URI}${Endpoint.TOKEN_REFRESH}`;

    const resp = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(data),
      signal: AbortSignal.timeout(this.timeout),
    });

    const response = await this.parseResponse(resp);

    if ("error" in response) {
      await this.login();
      return;
    }

    this.accessToken = response.data?.accessToken ?? null;
    this.refreshToken = response.data?.refreshToken ?? null;

    if (!this.accessToken || !this.refreshToken) {
      throw new CowayError(
        `Failed to refresh tokens for ${this.username}.`,
      );
    }

    this.tokenExpiration = new Date(Date.now() + 3600 * 1000);
  }

  // ------------------------------------------------------------------
  // Account data
  // ------------------------------------------------------------------

  private async getCountryCode(): Promise<string> {
    const endpoint = `${Endpoint.BASE_URI}${Endpoint.USER_INFO}`;
    const headers = await this.createEndpointHeader();
    const response = await this.getEndpoint(endpoint, headers, null);

    if ("data" in response) {
      if (response.data.maintainInfos) {
        throw new ServerMaintenance(
          "Coway Servers are undergoing maintenance.",
        );
      }
      const countryCode = response.data?.memberInfo?.countryCode as
        | string
        | undefined;
      if (countryCode) return countryCode;
      throw new CowayError(
        `Failed to get country code for ${this.username}.`,
      );
    }

    if ("error" in response) {
      throw new CowayError(
        `Failed to get country code associated with account. ${JSON.stringify(response.error)}`,
      );
    }

    throw new CowayError(
      `Unexpected response getting country code for ${this.username}.`,
    );
  }

  private async getPlaces(): Promise<PlaceSummary[]> {
    const endpoint = `${Endpoint.BASE_URI}${Endpoint.PLACES}`;
    const params: Record<string, string> = {
      countryCode: this.countryCode ?? "",
      langCd: Header.ACCEPT_LANG,
      pageIndex: "1",
      pageSize: "20",
      timezoneId: Parameter.TIMEZONE,
    };
    const headers = await this.createEndpointHeader();
    const response = await this.getEndpoint(endpoint, headers, params);

    if ("error" in response) {
      throw new CowayError(
        `Failed to get places associated with account. ${JSON.stringify(response.error)}`,
      );
    }

    const raw = response.data?.content as PlaceSummary[] | undefined;
    if (!raw?.length) {
      throw new NoPlaces(
        `No places found associated with ${this.username}.`,
      );
    }
    // API may return placeId as a number — coerce to string at the boundary
    const places: PlaceSummary[] = raw.map((p) => ({
      ...p,
      placeId: String(p.placeId),
    }));
    return places;
  }
}

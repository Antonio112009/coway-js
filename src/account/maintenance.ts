/** Server maintenance notice handling for Coway IoCare API. */

import * as cheerio from "cheerio";

import { Endpoint, Header, Parameter } from "../constants.js";
import { CowayError } from "../errors.js";
import { CowayAuthClient } from "./auth.js";
import type { JsonObject } from "../types.js";

/** Re-check notice list at most once per hour. */
const NOTICES_CHECK_INTERVAL = 3600 * 1000;

export interface MaintenanceInfo {
  sequence: number;
  startDateTime: Date | null;
  endDateTime: Date | null;
  description: string;
}

export class CowayMaintenanceClient extends CowayAuthClient {
  protected serverMaintenance: MaintenanceInfo | null = null;
  private noticesCheckedAt: Date | null = null;

  async asyncServerMaintenanceNotice(): Promise<void> {
    if (this.checkToken) {
      await this._checkToken();
    }

    const now = new Date();

    if (
      this.serverMaintenance &&
      this.noticesCheckedAt &&
      now.getTime() - this.noticesCheckedAt.getTime() < NOTICES_CHECK_INTERVAL
    ) {
      return;
    }

    const url = `${Endpoint.BASE_URI}${Endpoint.NOTICES}`;
    const headers: Record<string, string> = {
      accept: "*/*",
      langCd: Header.ACCEPT_LANG,
      ostype: Header.SOURCE_PATH,
      appVersion: Parameter.APP_VERSION,
      region: "NUS",
      "user-agent": Header.COWAY_USER_AGENT,
      authorization: `Bearer ${this.accessToken}`,
    };
    const params: Record<string, string> = {
      content: "",
      langCd: Header.ACCEPT_LANG,
      pageIndex: "1",
      pageSize: "20",
      title: "",
      topPinnedYn: "",
    };

    const listResponse = await this.getEndpoint(url, headers, params);

    if ("error" in listResponse) {
      throw new CowayError(
        `Failed to get maintenance notices: ${JSON.stringify(listResponse.error)}`,
      );
    }

    this.noticesCheckedAt = now;

    const notices = listResponse.data?.content as JsonObject[] | undefined;
    if (!notices?.length) return;

    const noticeSeq = notices[0].noticeSeq as number;

    if (this.serverMaintenance?.sequence === noticeSeq) {
      return;
    }

    await this.fetchAndParseNotice(noticeSeq);
  }

  private async fetchAndParseNotice(noticeSeq: number): Promise<void> {
    const url = `${Endpoint.BASE_URI}${Endpoint.NOTICES}/${noticeSeq}`;
    const headers: Record<string, string> = {
      region: "NUS",
      accept: "application/json, text/plain, */*",
      "user-agent": Header.HTML_USER_AGENT,
      authorization: `Bearer ${this.accessToken}`,
    };
    const params: Record<string, string> = { langCd: Header.ACCEPT_LANG };

    const latestNotice = await this.getEndpoint(url, headers, params);
    if ("error" in latestNotice) {
      throw new CowayError(
        `Failed to get latest maintenance notice: ${JSON.stringify(latestNotice.error)}`,
      );
    }

    const $ = cheerio.load(latestNotice.data.content as string);
    const noticeLines: string[] = [];
    const searchResultRef: { value: string[] | null } = { value: null };

    $("p").each((_, el) => {
      const text = $(el).text();
      if (text === "\u00a0") return;
      noticeLines.push(text);
      const lowerText = text.toLowerCase();
      if (lowerText.includes("[edt]")) {
        const pattern =
          /\[edt\].*(\d{4}-\d{2}-\d{2}).*(\d{2}:\d{2}).*(\d{4}-\d{2}-\d{2}).*(\d{2}:\d{2})/;
        const match = lowerText.match(pattern);
        if (match) {
          searchResultRef.value = [match[1], match[2], match[3], match[4]];
        }
      }
    });

    const description = noticeLines.join("\n");
    const searchResult = searchResultRef.value;

    if (searchResult && searchResult.length === 4) {
      const [startDate, startTime, endDate, endTime] = searchResult;
      // Parse as EDT (UTC-4)
      this.serverMaintenance = {
        sequence: latestNotice.data.noticeSeq as number,
        startDateTime: new Date(`${startDate}T${startTime}:00-04:00`),
        endDateTime: new Date(`${endDate}T${endTime}:00-04:00`),
        description,
      };
    } else {
      this.serverMaintenance = {
        sequence: latestNotice.data.noticeSeq as number,
        startDateTime: null,
        endDateTime: null,
        description,
      };
    }
  }
}

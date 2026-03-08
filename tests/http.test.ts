/** Tests for transport/http.ts – parseResponse & controlCommandResponse */

import { describe, it, expect } from "vitest";
import { CowayHttpClient } from "../src/transport/http.js";
import { AuthError, CowayError, ServerMaintenance } from "../src/errors.js";
import { ErrorMessages } from "../src/constants.js";

// Expose protected methods for testing via a thin subclass
class TestableHttpClient extends CowayHttpClient {
  async testParseResponse(resp: Response) {
    return this.parseResponse(resp);
  }
  async testControlCommandResponse(resp: Response) {
    return this.controlCommandResponse(resp);
  }
}

/** Build a minimal Response-like object for testing. */
function mockResponse(options: {
  status?: number;
  jsonData?: unknown;
  textData?: string;
  jsonThrows?: boolean;
} = {}): Response {
  const { status = 200, jsonData = {}, jsonThrows = false } = options;
  const textData = options.textData ?? JSON.stringify(jsonData);
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: new Headers(),
    json: jsonThrows
      ? () => Promise.reject(new SyntaxError("No JSON"))
      : () => Promise.resolve(jsonData),
    text: () => Promise.resolve(textData),
  } as unknown as Response;
}

const client = new TestableHttpClient();

// ── parseResponse ──────────────────────────────────────────────

describe("parseResponse", () => {
  it("returns json on success", async () => {
    const resp = mockResponse({ jsonData: { result: "ok" } });
    const result = await client.testParseResponse(resp);
    expect(result).toEqual({ result: "ok" });
  });

  it("throws ServerMaintenance when maintainInfos present", async () => {
    const resp = mockResponse({ jsonData: { data: { maintainInfos: [] } } });
    await expect(client.testParseResponse(resp)).rejects.toThrow(ServerMaintenance);
  });

  it("throws AuthError for invalid refresh token", async () => {
    const resp = mockResponse({
      jsonData: { error: { message: ErrorMessages.INVALID_REFRESH_TOKEN } },
    });
    await expect(client.testParseResponse(resp)).rejects.toThrow(AuthError);
  });

  it("throws CowayError for generic error key", async () => {
    const resp = mockResponse({ jsonData: { error: { message: "some error" } } });
    await expect(client.testParseResponse(resp)).rejects.toThrow(CowayError);
    await expect(client.testParseResponse(resp)).rejects.toThrow(/some error/);
  });

  it("throws AuthError on 401 with bad token", async () => {
    const resp = mockResponse({
      status: 401,
      textData: JSON.stringify({ message: ErrorMessages.BAD_TOKEN }),
    });
    await expect(client.testParseResponse(resp)).rejects.toThrow(AuthError);
  });

  it("returns error object on 401 with expired token", async () => {
    const resp = mockResponse({
      status: 401,
      textData: JSON.stringify({ message: ErrorMessages.EXPIRED_TOKEN }),
    });
    const result = await client.testParseResponse(resp);
    expect(result).toEqual({ error: ErrorMessages.EXPIRED_TOKEN });
  });

  it("returns error wrapper on non-200 with error key", async () => {
    const resp = mockResponse({
      status: 500,
      textData: JSON.stringify({ error: "internal" }),
    });
    const result = await client.testParseResponse(resp);
    expect(result).toHaveProperty("error");
  });

  it("throws CowayError on non-200 unparseable json", async () => {
    const resp = mockResponse({
      status: 500,
      textData: "Bad Gateway",
    });
    await expect(client.testParseResponse(resp)).rejects.toThrow(CowayError);
    await expect(client.testParseResponse(resp)).rejects.toThrow(/Could not parse JSON/);
  });

  it("throws CowayError on 200 with unparseable json", async () => {
    const resp = mockResponse({ jsonThrows: true });
    await expect(client.testParseResponse(resp)).rejects.toThrow(CowayError);
    await expect(client.testParseResponse(resp)).rejects.toThrow(/Could not parse JSON/);
  });
});

// ── controlCommandResponse ─────────────────────────────────────

describe("controlCommandResponse", () => {
  it("returns json on success", async () => {
    const resp = mockResponse({ jsonData: { result: "ok" } });
    const result = await client.testControlCommandResponse(resp);
    expect(result).toEqual({ result: "ok" });
  });

  it("throws ServerMaintenance when maintainInfos present", async () => {
    const resp = mockResponse({ jsonData: { data: { maintainInfos: [] } } });
    await expect(client.testControlCommandResponse(resp)).rejects.toThrow(ServerMaintenance);
  });

  it("returns stringified json on non-200", async () => {
    const resp = mockResponse({
      status: 500,
      jsonData: { detail: "error" },
      textData: "Server Error",
    });
    const result = await client.testControlCommandResponse(resp);
    expect(typeof result).toBe("string");
  });

  it("returns text when json is unparseable", async () => {
    const resp = mockResponse({ jsonThrows: true, textData: "raw text" });
    const result = await client.testControlCommandResponse(resp);
    expect(result).toBe("raw text");
  });
});

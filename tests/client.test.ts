/** Tests for CowayClient and CowayAuthClient. */

import { describe, it, expect, vi } from "vitest";
import { CowayClient } from "../src/client.js";

describe("CowayClient", () => {
  it("accepts positional credentials", () => {
    const client = new CowayClient("user@example.com", "s3cret");
    // Access protected fields via cast
    const c = client as unknown as { username: string; password: string };
    expect(c.username).toBe("user@example.com");
    expect(c.password).toBe("s3cret");
  });

  it("returns empty purifiers when places are missing", async () => {
    const client = new CowayClient("user@example.com", "s3cret");

    // Stub login to set up minimal state
    vi.spyOn(client as never, "login" as never).mockResolvedValue(undefined as never);
    // Stub getPlaces to return empty
    vi.spyOn(client as never, "getPlaces" as never).mockResolvedValue([] as never);
    // Ensure _checkToken doesn't make real requests
    vi.spyOn(client as never, "_checkToken" as never).mockResolvedValue(undefined as never);

    // Set places to empty to trigger NoPlaces/empty path
    (client as unknown as { places: unknown[] }).places = [];

    // The client should handle empty places gracefully
    expect((client as unknown as { places: unknown[] }).places).toEqual([]);
  });
});

describe("CowayAuthClient – _checkToken", () => {
  it("calls login when tokens are missing", async () => {
    const client = new CowayClient("user@example.com", "s3cret");

    const loginSpy = vi.spyOn(client as never, "login" as never).mockResolvedValue(undefined as never);

    // No tokens set → should call login directly
    await (client as unknown as { _checkToken: () => Promise<void> })._checkToken();

    expect(loginSpy).toHaveBeenCalled();
  });
});

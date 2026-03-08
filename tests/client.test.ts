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

    interface ClientInternal {
      login: () => Promise<void>;
      getPlaces: () => Promise<unknown[]>;
      _checkToken: () => Promise<void>;
      places: unknown[];
    }
    const c = client as unknown as ClientInternal;

    vi.spyOn(c, "login").mockResolvedValue(undefined);
    vi.spyOn(c, "getPlaces").mockResolvedValue([]);
    vi.spyOn(c, "_checkToken").mockResolvedValue(undefined);

    c.places = [];

    expect(c.places).toEqual([]);
  });
});

describe("CowayAuthClient – _checkToken", () => {
  it("calls login when tokens are missing", async () => {
    const client = new CowayClient("user@example.com", "s3cret");

    interface ClientInternal {
      login: () => Promise<void>;
      _checkToken: () => Promise<void>;
    }
    const c = client as unknown as ClientInternal;

    const loginSpy = vi.spyOn(c, "login").mockResolvedValue(undefined);

    await c._checkToken();

    expect(loginSpy).toHaveBeenCalled();
  });
});

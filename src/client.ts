/** Python API for Coway IoCare Purifiers. */

import type { CowayAuthClientOptions } from "./account/auth.js";
import { CowayControlClient } from "./devices/control.js";

export interface CowayClientOptions {
  timeout?: number;
  skipPasswordChange?: boolean;
}

/**
 * Coway IoCare API client.
 *
 * Inheritance chain:
 *   CowayHttpClient → CowayAuthClient → CowayMaintenanceClient
 *   → CowayDataClient → CowayControlClient → CowayClient
 */
export class CowayClient extends CowayControlClient {
  constructor(
    username: string,
    password: string,
    options: CowayClientOptions = {},
  ) {
    const opts: CowayAuthClientOptions = {
      username,
      password,
      ...options,
    };
    super(opts);
  }

  /** Use the client with async resource management pattern. */
  async [Symbol.asyncDispose](): Promise<void> {
    await this.close();
  }
}

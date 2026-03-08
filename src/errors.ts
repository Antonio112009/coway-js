/** Exceptions for Coway IoCare. */

export class CowayError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = new.target.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class AuthError extends CowayError {}

export class PasswordExpired extends CowayError {}

export class ServerMaintenance extends CowayError {}

export class RateLimited extends CowayError {}

export class NoPlaces extends CowayError {}

export class NoPurifiers extends CowayError {}

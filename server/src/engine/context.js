'use strict';

/**
 * TagContext accumulates resolved tags as generation proceeds:
 * planet -> mission type -> events. Each generator stage "provides"
 * values into it, and later stages "consume" (read) them when
 * filtering candidates or rendering templates.
 */
class TagContext {
  constructor() {
    this._tags = {};
  }

  set(key, value) {
    this._tags[key] = value;
    return this;
  }

  get(key) {
    return this._tags[key];
  }

  has(key) {
    return this._tags[key] !== undefined;
  }

  /** True if every tag name in `keys` has already been resolved. */
  hasAll(keys = []) {
    return keys.every((k) => this.has(k));
  }

  getAll() {
    return { ...this._tags };
  }
}

module.exports = TagContext;

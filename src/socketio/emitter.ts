/**
 * Minimal event emitter — zero dependencies.
 * Supports on/off/removeListener/emit as required by socket.io Decoder contract.
 */

type Listener = (...args: any[]) => void;

export class Emitter {
  /** @internal */
  _listeners: Map<string, Set<Listener>> = new Map();

  on(event: string, fn: Listener): this {
    let set = this._listeners.get(event);
    if (!set) {
      set = new Set();
      this._listeners.set(event, set);
    }
    set.add(fn);
    return this;
  }

  off(event: string, fn: Listener): this {
    this._listeners.get(event)?.delete(fn);
    return this;
  }

  removeListener(event: string, fn: Listener): this {
    return this.off(event, fn);
  }

  emit(event: string, ...args: any[]): this {
    const set = this._listeners.get(event);
    if (set) {
      for (const fn of set) fn(...args);
    }
    return this;
  }

  removeAllListeners(event?: string): this {
    if (event) {
      this._listeners.delete(event);
    } else {
      this._listeners.clear();
    }
    return this;
  }
}

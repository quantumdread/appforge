function addBounded(count: number, addition: number, limit: number): number {
  return addition >= limit - count ? limit : count + addition;
}

/** Count WHATWG UTF-8 bytes without allocating an encoded copy. */
export function countUtf8StringBytes(
  value: string,
  limit = Number.POSITIVE_INFINITY,
): number {
  let count = 0;
  for (let index = 0; index < value.length && count < limit; index++) {
    const unit = value.charCodeAt(index);
    let bytes: number;
    if (unit <= 0x7f) {
      bytes = 1;
    } else if (unit <= 0x7ff) {
      bytes = 2;
    } else if (unit >= 0xd800 && unit <= 0xdbff) {
      const low = value.charCodeAt(index + 1);
      if (low >= 0xdc00 && low <= 0xdfff) {
        bytes = 4;
        index++;
      } else {
        bytes = 3;
      }
    } else {
      bytes = 3;
    }
    count = addBounded(count, bytes, limit);
  }
  return count;
}

function countJsonStringBytes(value: string, limit: number): number {
  let count = addBounded(0, 1, limit);
  for (let index = 0; index < value.length && count < limit; index++) {
    const unit = value.charCodeAt(index);
    let bytes: number;
    if (unit === 0x22 || unit === 0x5c
      || unit === 0x08 || unit === 0x09 || unit === 0x0a
      || unit === 0x0c || unit === 0x0d) {
      bytes = 2;
    } else if (unit <= 0x1f) {
      bytes = 6;
    } else if (unit >= 0xd800 && unit <= 0xdbff) {
      const low = value.charCodeAt(index + 1);
      if (low >= 0xdc00 && low <= 0xdfff) {
        bytes = 4;
        index++;
      } else {
        bytes = 6;
      }
    } else if (unit >= 0xdc00 && unit <= 0xdfff) {
      bytes = 6;
    } else if (unit <= 0x7f) {
      bytes = 1;
    } else if (unit <= 0x7ff) {
      bytes = 2;
    } else {
      bytes = 3;
    }
    count = addBounded(count, bytes, limit);
  }
  return addBounded(count, 1, limit);
}

/** Count compact JSON UTF-8 bytes, saturating at limit without materializing JSON. */
export function countJsonUtf8Bytes(
  value: unknown,
  limit = Number.POSITIVE_INFINITY,
): number {
  const active = new Set<object>();
  const countValue = (candidate: unknown, remaining: number, inArray: boolean): number => {
    if (candidate === null) return Math.min(4, remaining);
    if (typeof candidate === 'string') return countJsonStringBytes(candidate, remaining);
    if (typeof candidate === 'boolean') return Math.min(candidate ? 4 : 5, remaining);
    if (typeof candidate === 'number') {
      const rendered = Number.isFinite(candidate) ? String(candidate) : 'null';
      return Math.min(rendered.length, remaining);
    }
    if (typeof candidate === 'undefined'
      || typeof candidate === 'function'
      || typeof candidate === 'symbol') {
      return inArray ? Math.min(4, remaining) : 0;
    }
    if (typeof candidate === 'bigint') {
      throw new TypeError('BigInt is not JSON serializable');
    }
    if (typeof candidate !== 'object') return 0;
    if (active.has(candidate)) throw new TypeError('circular JSON value');
    active.add(candidate);
    let count = 0;
    if (Array.isArray(candidate)) {
      count = addBounded(count, 1, remaining);
      for (let index = 0; index < candidate.length && count < remaining; index++) {
        if (index > 0) count = addBounded(count, 1, remaining);
        count = addBounded(
          count,
          countValue(candidate[index], remaining - count, true),
          remaining,
        );
      }
      count = addBounded(count, 1, remaining);
    } else {
      count = addBounded(count, 1, remaining);
      let emitted = 0;
      for (const key of Object.keys(candidate as Record<string, unknown>)) {
        const child = (candidate as Record<string, unknown>)[key];
        if (typeof child === 'undefined'
          || typeof child === 'function'
          || typeof child === 'symbol') continue;
        if (emitted++ > 0) count = addBounded(count, 1, remaining);
        count = addBounded(count, countJsonStringBytes(key, remaining - count), remaining);
        count = addBounded(count, 1, remaining);
        count = addBounded(
          count,
          countValue(child, remaining - count, false),
          remaining,
        );
        if (count >= remaining) break;
      }
      count = addBounded(count, 1, remaining);
    }
    active.delete(candidate);
    return count;
  };
  return countValue(value, limit, false);
}

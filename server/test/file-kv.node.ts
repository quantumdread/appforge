import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { decodeKey, encodeKey, FileKV } from '../src/local/file-kv';

describe('FileKV', () => {
  let temp: string;
  let dir: string;
  let kv: FileKV;

  beforeEach(() => {
    temp = mkdtempSync(join(tmpdir(), 'appforge-file-kv-'));
    dir = join(temp, 'kv');
    kv = new FileKV(dir);
  });
  afterEach(() => rmSync(temp, { recursive: true, force: true }));

  it('creates its directory only on put and returns null for absent keys', async () => {
    expect(existsSync(dir)).toBe(false);
    expect(await kv.get('missing')).toBeNull();
    expect(await kv.get('missing', 'text')).toBeNull();
    expect(await kv.get('missing', 'json')).toBeNull();
    expect(await kv.list()).toEqual({ keys: [], list_complete: true });
    expect(existsSync(dir)).toBe(false);
    await kv.put('present', 'value');
    expect(existsSync(dir)).toBe(true);
  });

  it('round-trips JSON and text, including the default text mode', async () => {
    const value = { count: 2, label: 'å', nested: { ok: true } };
    const text = JSON.stringify(value);
    await kv.put('json', text);
    expect(await kv.get('json', 'json')).toEqual(value);
    expect(await kv.get('json', 'text')).toBe(text);
    expect(await kv.get('json')).toBe(text);
    await kv.put('text', 'plain text\nsecond line');
    expect(await kv.get('text')).toBe('plain text\nsecond line');
  });

  it('decodes keys, filters by prefix, sorts ascending and limits the listing', async () => {
    for (const key of ['warn:z', 'refuse:a', 'warn:a', 'lint:b']) await kv.put(key, key);
    expect(await kv.list()).toEqual({
      keys: ['lint:b', 'refuse:a', 'warn:a', 'warn:z'].map(name => ({ name })),
      list_complete: true,
    });
    expect(await kv.list({ prefix: 'warn:' })).toEqual({
      keys: [{ name: 'warn:a' }, { name: 'warn:z' }], list_complete: true,
    });
    expect(await kv.list({ prefix: 'warn:', limit: 1 })).toEqual({
      keys: [{ name: 'warn:a' }], list_complete: true,
    });
    expect(await kv.list({ limit: 2 })).toEqual({
      keys: [{ name: 'lint:b' }, { name: 'refuse:a' }], list_complete: true,
    });
    expect(await kv.list({ limit: 0 })).toEqual({ keys: [], list_complete: true });
    expect(await kv.list({ prefix: 'missing:' })).toEqual({ keys: [], list_complete: true });
  });

  it.each(['refuse:ModernButton.FontSize', 'screen/control', '*', 'a space', 'å', ':/ * å', 'wow!', '!A', 'a!b'])(
    'round-trips the key %s through the filename and listing', async key => {
      const encoded = encodeKey(key);
      expect(encoded).toBe(encoded.toLowerCase());
      expect(decodeKey(encoded)).toBe(key);
      await kv.put(key, 'value');
      expect(readdirSync(dir)).toEqual([`${encoded}.json`]);
      expect(await kv.get(key)).toBe('value');
      expect(await kv.list()).toEqual({ keys: [{ name: key }], list_complete: true });
    },
  );

  it('keeps keys that differ only by case apart, even on a case-insensitive file system', async () => {
    await kv.put('warn:ModernButton.FontSize', 'upper');
    await kv.put('warn:modernbutton.fontsize', 'lower');
    expect(encodeKey('warn:ModernButton.FontSize')).not.toBe(encodeKey('warn:modernbutton.fontsize'));
    expect(await kv.get('warn:ModernButton.FontSize')).toBe('upper');
    expect(await kv.get('warn:modernbutton.fontsize')).toBe('lower');
    expect((await kv.list()).keys.map(key => key.name)).toEqual(['warn:ModernButton.FontSize', 'warn:modernbutton.fontsize']);
    expect(readdirSync(dir)).toHaveLength(2);
  });

  it('replaces an existing value and leaves only the target file', async () => {
    await kv.put('key', JSON.stringify({ count: 1 }));
    await kv.put('key', JSON.stringify({ count: 2 }));
    expect(await kv.get('key', 'json')).toEqual({ count: 2 });
    expect(readdirSync(dir)).toEqual(['key.json']);
  });
});

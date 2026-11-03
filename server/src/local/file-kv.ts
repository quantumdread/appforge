import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync, type Dirent } from 'node:fs';
import { join } from 'node:path';

// File names must be unique on case-insensitive file systems (Windows, default macOS), while KV keys are
// case-sensitive: near-miss telemetry stores keys such as `…fontsize` beside `…FontSize`. So the name is
// all lower case, with every capital marked by `!` (a literal `!` is percent-encoded first, so the
// mapping stays reversible). Percent-escape hex digits are capitals too and round-trip the same way.
export const encodeKey = (key: string): string => encodeURIComponent(key)
  .replace(/\*/g, '%2A')
  .replace(/!/g, '%21')
  .replace(/[A-Z]/g, letter => `!${letter.toLowerCase()}`);
export const decodeKey = (name: string): string => decodeURIComponent(
  name.replace(/!([a-z])/g, (_, letter: string) => letter.toUpperCase()),
);

/** The get/put/list subset of Workers KV used by the verification queue. */
export class FileKV {
  constructor(private readonly dir: string) {}

  async get(key: string, type?: 'text'): Promise<string | null>;
  async get<T = unknown>(key: string, type: 'json'): Promise<T | null>;
  async get(key: string, type?: 'text' | 'json'): Promise<unknown> {
    let value: string;
    try {
      value = readFileSync(join(this.dir, `${encodeKey(key)}.json`), 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
    return type === 'json' ? JSON.parse(value) : value;
  }

  async put(key: string, value: string): Promise<void> {
    mkdirSync(this.dir, { recursive: true });
    const target = join(this.dir, `${encodeKey(key)}.json`);
    const temp = join(this.dir, `${encodeKey(key)}.${randomUUID()}.tmp`);
    try {
      writeFileSync(temp, value, { encoding: 'utf8', flag: 'wx' });
      renameSync(temp, target);
    } finally {
      rmSync(temp, { force: true });
    }
  }

  async list({ prefix = '', limit = 1000 }: { prefix?: string; limit?: number } = {}): Promise<{
    keys: Array<{ name: string }>;
    list_complete: true;
  }> {
    let files: Dirent[];
    try {
      files = readdirSync(this.dir, { withFileTypes: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return { keys: [], list_complete: true };
      }
      throw error;
    }
    const keys = files
      .filter(file => file.isFile() && file.name.endsWith('.json'))
      .map(file => decodeKey(file.name.slice(0, -5)))
      .filter(key => key.startsWith(prefix))
      .sort()
      .slice(0, limit)
      .map(name => ({ name }));
    return { keys, list_complete: true };
  }
}

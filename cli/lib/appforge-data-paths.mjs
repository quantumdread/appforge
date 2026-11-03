/** Local storage paths only; no analyzer or corpus semantics. */
import { homedir } from 'node:os';
import { join } from 'node:path';

export function resolveAppForgeDataDir({ env = process.env, home = homedir() } = {}) {
  if (env.APPFORGE_DATA_DIR !== undefined) return env.APPFORGE_DATA_DIR;
  if (env.LOCALAPPDATA !== undefined) return join(env.LOCALAPPDATA, 'AppForge');
  return join(env.XDG_DATA_HOME ?? join(home, '.local', 'share'), 'appforge');
}

export function resolveExternalGolden(options = {}) {
  const env = options.env ?? process.env;
  return env.APPFORGE_CORPUS_EXTERNAL_GOLDEN
    ?? join(resolveAppForgeDataDir(options), 'corpus', 'golden-external.json');
}

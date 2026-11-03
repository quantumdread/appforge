import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

export class UsageError extends Error {}
const usage = 'usage: validate.mjs modernize <app-dir> --out <new-dir> [--types A,B] [--controls x,y] [--include-review] [--json]';

// Resolve existing ancestors as well as the leaf: a junction/symlink must not
// disguise an output inside the source directory, including not-yet-created paths.
export function physicalPath(path) {
  if (existsSync(path)) return realpathSync(path);
  const parent = dirname(path);
  if (parent === path) return path;
  return join(physicalPath(parent), basename(path));
}
export function inside(parent, child) {
  const rel = relative(parent, child);
  return rel === '' || (!isAbsolute(rel) && rel !== '..' && !rel.startsWith('..' + sep));
}
export function collect(root, prefix = '') {
  const files = [];
  for (const entry of readdirSync(join(root, prefix), { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const name = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isSymbolicLink()) throw new UsageError(`source contains a link: ${name}; provide a regular complete folder`);
    if (entry.isDirectory()) files.push(...collect(root, name));
    else if (entry.isFile()) files.push({ name, bytes: readFileSync(join(root, name)) });
    else throw new UsageError(`unsupported source entry: ${name}`);
  }
  return files;
}

export function runModernize(args, core) {
  try {
    const options = {}, positional = [], seen = new Set();
    let output, json = false;
    for (let index = 0; index < args.length; index++) {
      const arg = args[index];
      if (!arg.startsWith('--')) { positional.push(arg); continue; }
      if (seen.has(arg)) throw new UsageError(`duplicate option ${arg}`);
      seen.add(arg);
      if (arg === '--json') json = true;
      else if (arg === '--include-review') options.include_review = true;
      else if (['--out', '--types', '--controls'].includes(arg)) {
        const value = args[++index];
        if (!value || value.startsWith('--')) throw new UsageError(`${arg} needs a value`);
        if (arg === '--out') output = value;
        else {
          const entries = value.split(',').map(part => part.trim());
          if (entries.some(part => !part)) throw new UsageError(`${arg} needs non-empty comma-separated names`);
          options[arg.slice(2)] = entries;
        }
      } else throw new UsageError(`unknown option ${arg}`);
    }
    if (positional.length !== 1 || !output) throw new UsageError('one app directory and --out are required');
    const input = resolve(positional[0]), out = resolve(output);
    if (!lstatSync(input).isDirectory()) throw new UsageError('input must be a directory');
    if (inside(input, out) || inside(physicalPath(input), physicalPath(out))) throw new UsageError('output must not be the input directory or inside it');
    if (existsSync(out) && (!lstatSync(out).isDirectory() || readdirSync(out).length)) throw new UsageError('output must be a new or empty directory');
    if (typeof core.modernize !== 'function' || typeof core.renderModernizeReport !== 'function') throw new Error('analyzer artifact lacks modernization exports; rebuild it');
    const all = collect(input);
    if (all.some(file => /^modernize-report\.(?:md|json)$/iu.test(file.name))) throw new UsageError('input contains reserved modernize-report filenames');
    const yaml = all.filter(file => /\.ya?ml$/iu.test(file.name)).map(file => ({ name: file.name, content: file.bytes.toString('utf8') }));
    const result = core.modernize(yaml, core.loadCatalog(), options);
    const converted = new Map(result.files.map(file => [file.name, file.content]));
    mkdirSync(out, { recursive: true });
    for (const file of all) {
      const target = join(out, file.name);
      mkdirSync(dirname(target), { recursive: true });
      // Preserve every unchanged file byte-for-byte, including non-YAML assets.
      const content = converted.get(file.name);
      const bytes = content !== undefined && content !== file.bytes.toString('utf8') ? content : file.bytes;
      writeFileSync(target, bytes, { flag: 'wx' });
    }
    writeFileSync(join(out, 'modernize-report.md'), core.renderModernizeReport(result.report), { flag: 'wx' });
    writeFileSync(join(out, 'modernize-report.json'), JSON.stringify(result.report, null, 2) + '\n', { flag: 'wx' });
    console.log(json ? JSON.stringify(result.report, null, 2) : core.modernizeSummary(result.report));
    return result.report.self_check.regression || result.report.summary.converted === 0 ? 1 : 0;
  } catch (cause) {
    const isUsage = cause instanceof UsageError;
    console.error(`modernize ${isUsage ? 'usage' : 'infrastructure'} error: ${cause instanceof Error ? cause.message : String(cause)}`);
    if (isUsage) console.error(usage);
    return isUsage ? 2 : 3;
  }
}

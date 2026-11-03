import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { collect, inside, physicalPath, UsageError } from './modernize-command.mjs';

const usage = 'usage: validate.mjs rename <app-dir> --propose [--screen-prefix|--screen-prefix=auto] [--json] [--write-map <file>] OR rename <app-dir> --map <renames.json> --out <new-dir> [--json]';
export function runRename(args, core) {
  try {
    const values = {}, positional = [], seen = new Set();
    let propose = false, json = false, prefix = false;
    for (let i = 0; i < args.length; i++) {
      const arg = args[i], key = arg.split('=')[0];
      if (!arg.startsWith('--')) { positional.push(arg); continue; }
      if (seen.has(key)) throw new UsageError(`duplicate option ${key}`);
      seen.add(key);
      if (arg === '--propose') propose = true;
      else if (arg === '--json') json = true;
      else if (arg === '--screen-prefix') prefix = true;
      else if (arg === '--screen-prefix=auto') prefix = 'auto';
      else if (['--map', '--out', '--write-map'].includes(arg)) {
        const value = args[++i];
        if (!value || value.startsWith('--')) throw new UsageError(`${arg} needs a value`);
        values[arg.slice(2)] = value;
      } else throw new UsageError(`unknown option ${arg}`);
    }
    if (positional.length !== 1 || (propose ? values.map || values.out : !values.map || !values.out || values['write-map'] || seen.has('--screen-prefix'))) throw new UsageError('choose propose or map with out');
    const input = resolve(positional[0]);
    if (!lstatSync(input).isDirectory()) throw new UsageError('input must be a directory');
    const outside = target => {
      if (inside(input, target) || inside(physicalPath(input), physicalPath(target))) throw new UsageError('output must not be the input directory or inside it');
    };
    const out = values.out && resolve(values.out), mapOutput = values['write-map'] && resolve(values['write-map']);
    if (out) {
      outside(out);
      if (existsSync(out) && (!lstatSync(out).isDirectory() || readdirSync(out).length)) throw new UsageError('output must be a new or empty directory');
    }
    if (mapOutput) { outside(mapOutput); if (existsSync(mapOutput)) throw new UsageError('map output already exists'); }
    if (typeof core.proposeNames !== 'function' || typeof core.applyRenames !== 'function') throw new Error('analyzer artifact lacks rename exports; rebuild it');
    const all = collect(input);
    const yaml = all.filter(f => /\.ya?ml$/iu.test(f.name)).map(f => ({ name: f.name, content: f.bytes.toString('utf8') }));
    if (propose) {
      const result = core.proposeNames(yaml, core.loadCatalog(), { screen_prefix: prefix });
      if (mapOutput) {
        const map = Object.create(null);
        // Screen renames are done in Studio, not through compile_canvas; keep them out of the map.
        for (const row of result.proposals.filter(proposal => proposal.apply_in !== 'studio')) {
          if (Object.hasOwn(map, row.old)) throw new UsageError('duplicate source names cannot form one editable map; propose each app separately');
          map[row.old] = row.new;
        }
        writeFileSync(mapOutput, JSON.stringify(map, null, 2) + '\n', { flag: 'wx' });
      }
      console.log(json ? JSON.stringify(result, null, 2) : core.renderRenameProposals(result));
      return result.proposals.length ? 0 : 1;
    }
    if (all.some(f => /^rename-report\.(md|json)$/iu.test(f.name))) throw new UsageError('input contains reserved rename-report filenames');
    let map;
    const mapText = readFileSync(resolve(values.map), 'utf8');
    try { map = JSON.parse(mapText); } catch { throw new UsageError('map must be valid JSON'); }
    // The pure core completes all collision and self-check gates before mkdir.
    const result = core.applyRenames(yaml, core.loadCatalog(), map);
    const renamed = new Map(result.files.map(f => [f.name, f.content]));
    mkdirSync(out, { recursive: true });
    for (const file of all) {
      const target = join(out, file.name), content = renamed.get(file.name);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, content !== undefined && content !== file.bytes.toString('utf8') ? content : file.bytes, { flag: 'wx' });
    }
    writeFileSync(join(out, 'rename-report.json'), JSON.stringify(result.report, null, 2) + '\n', { flag: 'wx' });
    writeFileSync(join(out, 'rename-report.md'), core.renderRenameReport(result.report), { flag: 'wx' });
    console.log(json ? JSON.stringify(result.report, null, 2) : core.renameSummary(result.report));
    return result.report.summary.renamed ? 0 : 1;
  } catch (cause) {
    const selfCheck = cause?.name === 'RenameInputError' && cause.message.startsWith('Rename self-check failed');
    const isUsage = cause instanceof UsageError || (cause?.name === 'RenameInputError' && !selfCheck);
    console.error(`rename ${isUsage ? 'usage' : selfCheck ? 'self-check' : 'infrastructure'} error: ${cause instanceof Error ? cause.message : String(cause)}`);
    if (isUsage) console.error(usage);
    return selfCheck ? 1 : isUsage ? 2 : 3;
  }
}

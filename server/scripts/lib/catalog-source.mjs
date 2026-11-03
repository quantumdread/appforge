/** Side-effect-free extractor source parsers shared with the build. */
export function parseManifest(text) {
  const lines = text.replace(/\r/g, '').split('\n');
  const controls = [];
  let source = {}, counts = {}, extractedAt = '';
  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i];
    let m;
    if ((m = ln.match(/^extracted_at: (.+)$/))) extractedAt = m[1].trim();
    if ((m = ln.match(/^  - type: (?:"([^"]+)"|(\S+))/))) {
      const type = m[1] ?? m[2];
      let family = null, version = null, variants = [];
      for (let j = i + 1; j < Math.min(i + 6, lines.length); j++) {
        const fm = lines[j].match(/^    family: (\S+)/);
        const vm = lines[j].match(/^    version: (\S+)/);
        const vs = lines[j].match(/^    variants: \[([^\]]*)\]/);
        if (fm) family = fm[1];
        if (vm) version = vm[1] === 'null' ? null : vm[1];
        if (vs) variants = vs[1].split(',').map(s => s.trim()).filter(Boolean);
        if (lines[j].match(/^  - type:/)) break;
      }
      controls.push({ type, family, version, variants });
    }
  }
  // Re-parse for the source block (small and easy)
  let inSource = false, inCounts = false;
  for (const ln of lines) {
    if (/^source:\s*$/.test(ln)) { inSource = true; inCounts = false; continue; }
    if (/^counts:\s*$/.test(ln)) { inCounts = true; inSource = false; continue; }
    if (/^[a-z_]+:/.test(ln)) { inSource = false; inCounts = false; continue; }
    const m = ln.match(/^  ([a-z_]+):\s*(\S.*)$/);
    if (m && inSource) source[m[1]] = m[2].replace(/^"|"$/g, '');
    if (m && inCounts) {
      const n = Number(m[2]);
      counts[m[1]] = Number.isFinite(n) ? n : m[2] === 'true' ? true : m[2] === 'false' ? false : m[2];
    }
  }
  return { extractedAt, source, counts, controls };
}

// ─── Properties parser ────────────────────────────────────────────────────
export function parseProperties(text) {
  const lines = text.replace(/\r/g, '').split('\n');
  const enums = {};
  const parentContext = {};
  const controls = {};
  let section = null;
  let curBundle = null, curControl = null, curVariant = null, curSub = null;

  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i];
    let m;
    if (/^enums:\s*$/.test(ln)) { section = 'enums'; continue; }
    if (/^parent_context_properties:\s*$/.test(ln)) { section = 'parent'; curBundle = null; continue; }
    if (/^controls:\s*$/.test(ln)) { section = 'controls'; curControl = null; continue; }

    if (section === 'enums' && (m = ln.match(/^  (?:"([^"]+)"|(\S+)): \[([^\]]*)\]/))) {
      enums[m[1] ?? m[2]] = m[3].split(',').map(s => s.trim()).filter(Boolean);
      continue;
    }
    if (section === 'parent') {
      if ((m = ln.match(/^  (\w+):\s*$/))) { curBundle = m[1]; parentContext[curBundle] = {}; continue; }
      if (curBundle && (m = ln.match(/^    (\w+): (.+)$/))) {
        parentContext[curBundle][m[1]] = m[2].replace(/^"|"$/g, '');
      }
      continue;
    }
    if (section === 'controls') {
      if ((m = ln.match(/^  (?:"([^"]+)"|([A-Za-z][\w/]*)):\s*$/))) {
        curControl = m[1] ?? m[2];
        controls[curControl] = {
          family: '', variants: [],
          input_properties: {}, variant_input_properties: {},
          parent_context: [], output_properties: [],
        };
        curSub = null;
        continue;
      }
      if (!curControl) continue;
      if ((m = ln.match(/^    family: (\S+)/))) { controls[curControl].family = m[1]; continue; }
      if ((m = ln.match(/^    variants: \[([^\]]*)\]/))) {
        controls[curControl].variants = m[1].split(',').map(s => s.trim()).filter(Boolean);
        continue;
      }
      if ((m = ln.match(/^    output_properties: \[([^\]]*)\]/))) {
        controls[curControl].output_properties = m[1].split(',').map(s => s.trim()).filter(Boolean);
        continue;
      }
      if ((m = ln.match(/^    parent_context: \[([^\]]*)\]/))) {
        controls[curControl].parent_context = m[1].split(',').map(s => s.trim()).filter(Boolean);
        continue;
      }
      if (/^    input_properties:\s*$/.test(ln)) { curSub = 'input'; continue; }
      if (/^    input_properties:\s*\{\s*\}/.test(ln)) { curSub = null; continue; }
      if (/^    variant_input_properties:\s*$/.test(ln)) { curSub = 'varprops'; curVariant = null; continue; }
      if (curSub === 'input' && (m = ln.match(/^      (\w+): (.+)$/))) {
        controls[curControl].input_properties[m[1]] = m[2].replace(/^"|"$/g, '');
        continue;
      }
      if (curSub === 'varprops') {
        if ((m = ln.match(/^      (\w+):\s*\{\s*\}/))) {
          controls[curControl].variant_input_properties[m[1]] = {}; curVariant = null; continue;
        }
        if ((m = ln.match(/^      (\w+):\s*$/))) {
          curVariant = m[1]; controls[curControl].variant_input_properties[curVariant] = {}; continue;
        }
        if (curVariant && (m = ln.match(/^        (\w+): (.+)$/))) {
          controls[curControl].variant_input_properties[curVariant][m[1]] = m[2].replace(/^"|"$/g, '');
        }
      }
    }
  }
  // Resolve omitted Variant once at build time; the analyzer consumes these maps.
  for (const entry of Object.values(controls)) {
    const bundles = Object.entries(entry.variant_input_properties);
    entry.common_variant_properties = {};
    entry.variant_property_variants = {};
    for (const [variant, bundle] of bundles) {
      for (const property of Object.keys(bundle)) {
        (entry.variant_property_variants[property] ??= []).push(variant);
      }
    }
    for (const [property, variants] of Object.entries(entry.variant_property_variants)) {
      if (variants.length === bundles.length) {
        entry.common_variant_properties[property] = bundles[0][1][property];
      }
    }
  }
  return { enums, parentContext, controls };
}

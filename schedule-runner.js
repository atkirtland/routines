/* Schedule Runner core. Works in Obsidian (window.ScheduleRunner) and Node. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.ScheduleRunner = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const graphemes = s => Array.from(String(s).normalize("NFC"));
  const isSpace = c => /\s/u.test(c || "");

  // Small, dependency-free YAML reader for the registry schema. It supports
  // indentation-based mappings/lists, inline lists, strings, booleans, null,
  // and numbers. Keeping this here avoids relying on Obsidian's parseYaml
  // export being installed as a DataviewJS global (it normally is not).
  function parseRegistryYaml(source) {
    const rows = String(source).split(/\r?\n/).map((raw, index) => {
      const withoutComment = raw.replace(/\s+#.*$/, "");
      return { index: index + 1, indent: withoutComment.match(/^\s*/)[0].replace(/\t/g, "  ").length, text: withoutComment.trim() };
    }).filter(row => row.text);
    const scalar = value => {
      const s = value.trim();
      if (s === "[]") return [];
      if (s.startsWith("[") && s.endsWith("]")) return s.slice(1, -1).split(",").map(x => scalar(x)).filter(x => x !== "");
      if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) return s.slice(1, -1);
      if (/^-?\d+(?:\.\d+)?$/.test(s)) return Number(s);
      if (s === "true") return true;
      if (s === "false") return false;
      if (s === "null" || s === "~") return null;
      return s;
    };
    function block(at, indent) {
      const list = rows[at]?.indent === indent && rows[at].text.startsWith("- ");
      const value = list ? [] : {};
      while (at < rows.length && rows[at].indent === indent && rows[at].text.startsWith("- ") === list) {
        const row = rows[at];
        if (list) {
          const rest = row.text.slice(2).trim();
          if (!rest) {
            if (!rows[at + 1] || rows[at + 1].indent <= indent) value.push(null);
            else { const child = block(at + 1, rows[at + 1].indent); value.push(child.value); at = child.at - 1; }
          } else value.push(scalar(rest));
        } else {
          const match = row.text.match(/^([^:]+):(?:\s+(.*))?$/);
          if (!match) throw new Error(`Invalid registry YAML on line ${row.index}: ${row.text}`);
          const key = match[1].trim(), rest = match[2];
          if (Object.prototype.hasOwnProperty.call(value, key)) throw new Error(`Duplicate registry key '${key}' on line ${row.index}`);
          if (rest !== undefined) value[key] = scalar(rest);
          else if (!rows[at + 1] || rows[at + 1].indent <= indent) value[key] = {};
          else { const child = block(at + 1, rows[at + 1].indent); value[key] = child.value; at = child.at - 1; }
        }
        at++;
      }
      return { value, at };
    }
    if (!rows.length) throw new Error("Registry YAML is empty");
    if (rows[0].indent !== 0) throw new Error(`Registry YAML must start at column 1 (line ${rows[0].index})`);
    const parsed = block(0, 0);
    if (parsed.at !== rows.length) throw new Error(`Unexpected indentation in registry YAML on line ${rows[parsed.at].index}`);
    return parsed.value;
  }

  function tokenize(source, knownCodes) {
    const s = String(source || "").normalize("NFC");
    const known = [...(knownCodes || [])].sort((a, b) => b.length - a.length);
    const out = [];
    for (let i = 0; i < s.length;) {
      if (isSpace(s[i])) { i++; continue; }
      if (",/()".includes(s[i])) { out.push({ type: s[i], value: s[i++] }); continue; }
      const hit = known.find(code => s.startsWith(code, i));
      if (hit) { out.push({ type: "code", value: hit }); i += hit.length; continue; }
      const cp = String.fromCodePoint(s.codePointAt(i));
      out.push({ type: "code", value: cp, unknown: true }); i += cp.length;
    }
    return out;
  }

  function parseExpression(source, registry) {
    if (source === true || source == null || String(source).trim() === "") return { type: "true" };
    const codes = registry ? [...registry.codes, ...registry.aliases.keys()] : [];
    const t = tokenize(source, codes); let i = 0;
    const primary = () => {
      if (t[i]?.type === "(") { i++; const n = union(); if (t[i]?.type !== ")") throw new Error("Missing closing parenthesis"); i++; return n; }
      if (t[i]?.type !== "code") throw new Error(`Expected project code at token ${i + 1}`);
      const x = t[i++]; return { type: "code", code: x.value, unknown: x.unknown };
    };
    const intersection = () => {
      const nodes = [primary()];
      while (t[i] && t[i].type !== "," && t[i].type !== ")") {
        if (t[i].type === "/") i++;
        nodes.push(primary());
      }
      return nodes.length === 1 ? nodes[0] : { type: "and", nodes };
    };
    const union = () => {
      const nodes = [intersection()];
      while (t[i]?.type === ",") { i++; nodes.push(intersection()); }
      return nodes.length === 1 ? nodes[0] : { type: "or", nodes };
    };
    const result = union();
    if (i !== t.length) throw new Error(`Unexpected token ${t[i].value}`);
    return result;
  }

  function validateRegistry(raw) {
    const errors = [], projects = raw?.projects || {}, codes = Object.keys(projects);
    const codeSet = new Set(codes), aliases = new Map();
    for (const code of codes) {
      const p = projects[code] || {};
      if (graphemes(code).length !== 1) errors.push(`Project code '${code}' must be one grapheme for compact notation`);
      for (const parent of p.parents || []) if (!codeSet.has(parent)) errors.push(`Project '${code}' has unknown parent '${parent}'`);
      for (const alias of p.aliases || []) {
        if (codeSet.has(alias) || aliases.has(alias)) errors.push(`Alias '${alias}' is duplicated or shadows a code`);
        else aliases.set(alias, code);
      }
    }
    const visiting = new Set(), done = new Set();
    function visit(code) {
      if (visiting.has(code)) { errors.push(`Hierarchy cycle involving '${code}'`); return; }
      if (done.has(code)) return;
      visiting.add(code); for (const p of projects[code]?.parents || []) if (codeSet.has(p)) visit(p);
      visiting.delete(code); done.add(code);
    }
    codes.forEach(visit);
    for (const [n, group] of (raw?.["exclusive-groups"] || []).entries()) {
      if (!Array.isArray(group) || group.length < 2) errors.push(`Exclusive group ${n + 1} must contain at least two codes`);
      for (const code of group || []) if (!codeSet.has(code) && !aliases.has(code)) errors.push(`Exclusive group ${n + 1} has unknown code '${code}'`);
    }
    const settings = raw?.settings || {};
    if (settings["warning-level"] != null && !["all", "conflicts-and-unconfirmed", "conflicts-only", "none"].includes(settings["warning-level"]))
      errors.push(`Unknown warning-level '${settings["warning-level"]}'`);
    if (settings["new-scope-style"] != null && !["compact", "slash"].includes(settings["new-scope-style"]))
      errors.push(`Unknown new-scope-style '${settings["new-scope-style"]}'`);
    if (settings["undo-seconds"] != null && (!Number.isFinite(settings["undo-seconds"]) || settings["undo-seconds"] < 0))
      errors.push("undo-seconds must be a non-negative number");
    if (errors.length) return { ok: false, errors };
    const canonical = c => aliases.get(c) || c;
    const parents = new Map(codes.map(c => [c, new Set((projects[c].parents || []).map(canonical))]));
    const closure = new Map();
    function ancestors(c) {
      if (closure.has(c)) return closure.get(c);
      const set = new Set([c]); closure.set(c, set);
      for (const p of parents.get(c) || []) for (const x of ancestors(p)) set.add(x);
      return set;
    }
    codes.forEach(ancestors);
    const exclusive = (raw["exclusive-groups"] || []).map(g => new Set(g.map(canonical)));
    // A child cannot imply two members of one exclusive group.
    for (const c of codes) for (const g of exclusive) {
      const hits = [...g].filter(x => ancestors(c).has(x));
      if (hits.length > 1) errors.push(`Project '${c}' implies mutually exclusive codes: ${hits.join(", ")}`);
    }
    const projectOrder = new Map(codes.map((code, index) => [code, index]));
    return errors.length ? { ok: false, errors } : { ok: true, errors: [], raw, projects, projectOrder, codes: codeSet, aliases, canonical, ancestors, exclusive };
  }

  function toDNF(node, reg, flags = { unknown: false }) {
    if (node.type === "true") return { terms: [new Set()], unknown: false };
    if (node.type === "code") {
      const c = reg.canonical(node.code);
      if (!reg.codes.has(c)) { flags.unknown = true; return { terms: [new Set([`?${node.code}`])], unknown: true }; }
      return { terms: [new Set([c])], unknown: false };
    }
    const parts = node.nodes.map(n => toDNF(n, reg, flags));
    if (node.type === "or") return { terms: parts.flatMap(p => p.terms), unknown: parts.some(p => p.unknown) };
    let terms = [new Set()];
    for (const part of parts) terms = terms.flatMap(a => part.terms.map(b => new Set([...a, ...b])));
    return { terms, unknown: parts.some(p => p.unknown) };
  }
  function expanded(term, reg) {
    const out = new Set(term);
    for (const c of term) if (!c.startsWith("?")) for (const p of reg.ancestors(c)) out.add(p);
    return out;
  }
  function impossible(term, reg) {
    const e = expanded(term, reg);
    return reg.exclusive.some(g => [...g].filter(x => e.has(x)).length > 1);
  }
  function termImplies(a, b, reg) {
    const ea = expanded(a, reg);
    return [...b].every(x => ea.has(x));
  }
  function classify(taskSource, blockSource, reg) {
    const t = toDNF(parseExpression(taskSource, reg), reg), b = toDNF(parseExpression(blockSource, reg), reg);
    if (t.unknown || b.unknown) return { state: "unconfirmed", unknown: true };
    const tLive = t.terms.filter(x => !impossible(x, reg)), bLive = b.terms.filter(x => !impossible(x, reg));
    if (!tLive.length || !bLive.length) return { state: "conflict", unknown: false };
    const entails = tLive.every(tt => bLive.some(bt => termImplies(tt, bt, reg)));
    if (entails) return { state: "confirmed", unknown: false };
    const compatible = tLive.some(tt => bLive.some(bt => !impossible(new Set([...tt, ...bt]), reg)));
    return { state: compatible ? "unconfirmed" : "conflict", unknown: false };
  }

  function expressionStyle(source, fallback = "compact") {
    return String(source).includes("/") ? "slash" : String(source).match(/[^,()]\s+[^,()]/u) ? fallback : "compact";
  }
  function formatExpression(source, reg, requestedStyle = "preserve") {
    if (source === true || source == null || String(source).trim() === "") return true;
    const style = requestedStyle === "preserve"
      ? expressionStyle(source, reg.raw?.settings?.["new-scope-style"] || "compact")
      : requestedStyle;
    const order = code => reg.projectOrder.get(reg.canonical(code)) ?? Number.MAX_SAFE_INTEGER;
    const render = (node, parent = null) => {
      if (node.type === "true") return "true";
      if (node.type === "code") return reg.codes.has(reg.canonical(node.code)) ? reg.canonical(node.code) : node.code;
      const nodes = node.type === "and" ? [...node.nodes].sort((a, b) => {
        const ac = a.type === "code" ? order(a.code) : Number.MAX_SAFE_INTEGER;
        const bc = b.type === "code" ? order(b.code) : Number.MAX_SAFE_INTEGER;
        return ac - bc;
      }) : node.nodes;
      const separator = node.type === "or" ? "," : style === "slash" ? "/" : "";
      const rendered = nodes.map(child => render(child, node.type));
      const value = [...new Set(rendered)].join(separator);
      return parent === "and" && node.type === "or" ? `(${value})` : value;
    };
    return render(parseExpression(source, reg));
  }
  function shouldShowClassification(state, setting = "conflicts-and-unconfirmed") {
    if (setting === "none") return false;
    if (setting === "conflicts-only") return state === "conflict";
    if (setting === "all") return true;
    return state === "conflict" || state === "unconfirmed";
  }

  const TIME = "(?:[01]\\d|2[0-3])[0-5]\\d";
  const MAIN_RE = new RegExp(`^(\\s*)[-*+]\\s+(${TIME})(?:\\s+\\+(\\d+)([mh]))?\\s+(.+?)(?:\\s+\\^([\\w-]+))?\\s*$`, "u");
  const CONTEXT_RE = new RegExp(`^(\\s*)[-*+]\\s+(${TIME})-(${TIME})?\\s+(.+?)(?:\\s+\\^([\\w-]+))?\\s*$`, "u");
  const BOUNDARY_RE = new RegExp(`^(\\s*)[-*+]\\s+(${TIME})\\s+—(?:\\s+\\^([\\w-]+))?\\s*$`, "u");
  const heading = (lines, name) => lines.findIndex(x => new RegExp(`^##\\s+${name}\\s*$`, "i").test(x));
  const indentOf = s => s.replace(/\t/g, "    ").length;
  function sectionEnd(lines, start) { let i = start + 1; while (i < lines.length && !/^#{1,2}\s/.test(lines[i])) i++; return i; }
  function parseSection(text, name) {
    const lines = String(text).split(/\r?\n/), start = heading(lines, name);
    if (start < 0) return { lines, start: -1, end: -1, entries: [] };
    const end = sectionEnd(lines, start), entries = [], stack = [];
    for (let i = start + 1; i < end; i++) {
      let m, role;
      if ((m = lines[i].match(BOUNDARY_RE))) role = "boundary";
      else if ((m = lines[i].match(CONTEXT_RE))) role = "context";
      else if ((m = lines[i].match(MAIN_RE))) role = "main";
      else continue;
      const indent = indentOf(m[1]);
      while (stack.length && stack.at(-1).indent >= indent) stack.pop();
      const parent = stack.at(-1)?.entry || null;
      const entry = role === "boundary"
        ? { role, line: i, indent, start: m[2], id: m[3] || null, parent }
        : role === "context"
          ? { role, line: i, indent, start: m[2], end: m[3] || null, body: m[4], id: m[5] || null, parent }
          : { role, line: i, indent, start: m[2], duration: m[3] ? Number(m[3]) * (m[4] === "h" ? 60 : 1) : null, body: m[5], id: m[6] || null, parent };
      entries.push(entry); if (role === "main") stack.push({ indent, entry });
    }
    return { lines, start, end, entries };
  }
  function allBlockIds(text) {
    const ids = [], re = /(?:^|\s)\^([\w-]+)\s*$/u;
    String(text).split(/\r?\n/).forEach((line, index) => { const m = line.match(re); if (m) ids.push({ id: m[1], line: index }); });
    return ids;
  }
  function uniqueId(base, used) {
    let id = base, n = 2;
    while (used.has(id)) id = `${base}-${n++}`;
    used.add(id); return id;
  }
  function ensurePlanIds(text) {
    const section = parseSection(text, "Plan");
    if (section.start < 0) return { text: String(text), changed: false, assigned: [], errors: [] };
    const ids = allBlockIds(text), errors = [];
    const counts = new Map();
    for (const x of ids) counts.set(x.id, (counts.get(x.id) || 0) + 1);
    for (const [id, count] of counts) if (count > 1) errors.push(`Duplicate block ID '^${id}'`);
    if (errors.length) return { text: String(text), changed: false, assigned: [], errors };
    const used = new Set(ids.map(x => x.id)), lines = section.lines.slice(), assigned = [];
    let previousMain = null;
    for (const entry of section.entries) {
      if (entry.role === "main") previousMain = entry;
      if (entry.id) continue;
      let stem;
      if (entry.role === "boundary") stem = `${slug(previousMain?.id || previousMain?.body || "boundary")}-end`;
      else stem = slug(entry.body.replace(/\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|([^\]]+))?\]\]/g, "$2$1"));
      const id = uniqueId(`p-${stem}`, used);
      lines[entry.line] = `${lines[entry.line].replace(/\s+$/, "")} ^${id}`;
      assigned.push({ line: entry.line, id, role: entry.role });
    }
    return { text: lines.join("\n"), changed: assigned.length > 0, assigned, errors: [] };
  }
  function actualState(text) {
    const s = parseSection(text, "Actual"), activeMain = [], contexts = [];
    for (const e of s.entries) {
      if (e.role === "context" && !e.end) contexts.push(e);
      if (e.role === "boundary") { while (activeMain.length && activeMain.at(-1).indent >= e.indent) activeMain.pop(); }
      if (e.role === "main") {
        while (activeMain.length && activeMain.at(-1).indent >= e.indent) activeMain.pop();
        activeMain.push(e);
      }
    }
    return { section: s, mainChain: activeMain, mainLeaf: activeMain.at(-1) || null, contexts };
  }
  const hhmm = d => `${String(d.getUTCHours()).padStart(2,"0")}${String(d.getUTCMinutes()).padStart(2,"0")}`;
  const timeMinutes = value => Number(value.slice(0, 2)) * 60 + Number(value.slice(2));
  const clamp = (n, low, high) => Math.max(low, Math.min(high, n));
  function progressFor(plan, actual, now = new Date()) {
    const current = now.getUTCHours() * 60 + now.getUTCMinutes();
    let start, end, kind;
    if (plan.role === "context" && plan.end) { start = timeMinutes(plan.start); end = timeMinutes(plan.end); kind = "anchored"; }
    else if (plan.role === "main" && plan.duration && actual) { start = timeMinutes(actual.start); end = start + plan.duration; kind = "relative"; }
    else return null;
    const elapsed = current - start, duration = Math.max(1, end - start);
    return { kind, start, end, elapsed, duration, percent: clamp(elapsed / duration * 100, 0, 100), overrun: Math.max(0, elapsed - duration) };
  }
  const slug = s => String(s || "block").replace(/^p-/, "").replace(/[^\p{L}\p{N}-]+/gu, "-").replace(/^-|-$/g, "").toLocaleLowerCase("en-US") || "block";
  function nextOccurrence(text, planId) {
    const re = new RegExp(`\\^a-${slug(planId)}-(\\d+)\\b`, "g"); let n = 0, m; while ((m = re.exec(text))) n = Math.max(n, +m[1]); return n + 1;
  }
  function ensureActual(text) { return /^##\s+Actual\s*$/mi.test(text) ? text : `${text.replace(/\s*$/, "")}\n\n## Actual\n`; }
  function appendActual(text, line) {
    const base = ensureActual(text), lines = String(base).split(/\r?\n/), actual = heading(lines, "Actual");
    if (actual >= 0 && lines.slice(actual + 1).every(x => !x.trim()))
      return `${lines.slice(0, actual + 1).join("\n")}\n\n${line}\n`;
    return `${base.replace(/\s*$/, "")}\n${line}\n`;
  }
  function dismissedPlanIds(text) {
    return new Set([...String(text).matchAll(/%%\s*scheduled-block-dismissed:\s*([\w-]+)\s*%%/gu)].map(m => m[1]));
  }
  function dismissBlock(text, plan) {
    if (!plan?.id) throw new Error("Planned blocks need a block ID");
    if (dismissedPlanIds(text).has(plan.id)) return text;
    return appendActual(text, `%% scheduled-block-dismissed: ${plan.id} %%`);
  }
  function taskBlockId(body) {
    return String(body || "").match(/\[\[[^\]]*#\^([\w-]+)(?:\|[^\]]+)?\]\]/u)?.[1] || null;
  }
  function doneTaskActuals(text, canonicalId, now = new Date()) {
    let result = String(text), state = actualState(result);
    const affectedMain = state.mainChain.map((entry, index) => ({ entry, index })).filter(x => taskBlockId(x.entry.body) === canonicalId);
    if (affectedMain.some(x => state.mainChain.slice(x.index + 1).some(child => taskBlockId(child.body) !== canonicalId)))
      throw new Error("Done is unavailable while an affected task block has an active descendant");
    for (const context of state.contexts.filter(x => taskBlockId(x.body) === canonicalId)) {
      result = endBlock(result, context, now);
      state = actualState(result);
    }
    while (state.mainLeaf && taskBlockId(state.mainLeaf.body) === canonicalId) {
      result = endBlock(result, state.mainLeaf, now);
      state = actualState(result);
    }
    return result;
  }
  function startBlock(text, plan, now = new Date()) {
    if (!plan?.id) throw new Error("Planned blocks need a block ID");
    const state = actualState(text), time = hhmm(now), occ = nextOccurrence(text, plan.id);
    if (plan.role === "context") return appendActual(text, `- ${time}- ${plan.body} ^a-${slug(plan.id)}-${occ}`);
    const ancestors = []; for (let p = plan; p; p = p.parent) if (p.role === "main") ancestors.unshift(p);
    const actualPlanSlug = e => e.id?.match(/^a-(.+)-\d+$/)?.[1] || null;
    let shared = 0;
    while (shared < state.mainChain.length && shared < ancestors.length && actualPlanSlug(state.mainChain[shared]) === slug(ancestors[shared].id)) shared++;
    if (shared < state.mainChain.length) throw new Error("End the current main leaf before starting another main block");
    if (shared === ancestors.length) throw new Error("This main block is already active");
    let result = text;
    ancestors.slice(shared).forEach((p, offset) => {
      const depth = shared + offset;
      result = appendActual(result, `${"  ".repeat(depth)}- ${time} ${p.body} ^a-${slug(p.id)}-${nextOccurrence(result, p.id)}`);
    });
    return result;
  }
  function endBlock(text, actual, now = new Date(), mode = "end") {
    const time = hhmm(now), state = actualState(text);
    if (actual.role === "main") {
      if (state.mainLeaf?.line !== actual.line) throw new Error("A main parent cannot end while a descendant is active");
      let result = appendActual(text, `${" ".repeat(actual.indent)}- ${time} — ^${actual.id}-end`);
      const planSlug = actual.id?.match(/^a-(.+)-\d+$/)?.[1];
      if (mode === "pause") result = appendActual(result, `%% scheduled-block-paused: ${actual.id} %%`);
      else if (planSlug) result = appendActual(result, `%% scheduled-block-ended: ${planSlug} %%`);
      return result;
    }
    const lines = text.split(/\r?\n/), current = lines[actual.line];
    if (!current || actual.end) throw new Error("Context occurrence is not running");
    lines[actual.line] = current.replace(new RegExp(`(${TIME})-`), `$1-${time}`);
    let result = lines.join("\n"), planSlug = actual.id?.match(/^a-(.+)-\d+$/)?.[1];
    if (mode === "pause") result = appendActual(result, `%% scheduled-block-paused: ${actual.id} %%`);
    else if (planSlug) result = appendActual(result, `%% scheduled-block-ended: ${planSlug} %%`);
    return result;
  }
  function completedPlanSlugs(text) {
    const source = String(text), completed = new Set([...source.matchAll(/%%\s*scheduled-block-ended:\s*([\w-]+)\s*%%/gu)].map(m => m[1]));
    const paused = new Set([...source.matchAll(/%%\s*scheduled-block-paused:\s*([\w-]+)\s*%%/gu)].map(m => m[1]));
    // Before End/Pause had distinct markers, a main boundary represented End.
    for (const match of source.matchAll(/\^((a-(.+)-\d+))-end\s*$/gmu)) if (!paused.has(match[1])) completed.add(match[3]);
    return completed;
  }
  function editActualTime(text, entryLine, edge, value) {
    if (!new RegExp(`^${TIME}$`).test(value)) throw new Error("Use a valid UTC HHMM time");
    const state = actualState(text), entry = state.section.entries.find(e => e.line === entryLine);
    if (!entry) throw new Error("Actual entry no longer exists");
    const lines = state.section.lines.slice(), replacement = timeMinutes(value);
    if (edge === "end" && entry.role !== "context") throw new Error("Only context entries have editable inline end times");
    if (edge === "start") {
      lines[entry.line] = lines[entry.line].replace(new RegExp(`(${TIME})(?=-|\\s)`), value);
    } else {
      if (!entry.end) throw new Error("End the context before editing its end time");
      lines[entry.line] = lines[entry.line].replace(new RegExp(`(${TIME})-(${TIME})`), `$1-${value}`);
    }
    const result = lines.join("\n"), validation = validateActualIntervals(result);
    if (!validation.ok) throw new Error(validation.errors[0]);
    return result;
  }
  function actualIntervals(text) {
    const section = parseSection(text, "Actual"), entries = section.entries;
    return entries.filter(e => e.role !== "boundary").map((entry, index) => {
      if (entry.role === "context") return { entry, start: timeMinutes(entry.start), end: entry.end ? timeMinutes(entry.end) : null };
      let end = null;
      for (const candidate of entries.slice(index + 1)) {
        if ((candidate.role === "boundary" || candidate.role === "main") && candidate.indent <= entry.indent) {
          end = timeMinutes(candidate.start); break;
        }
      }
      return { entry, start: timeMinutes(entry.start), end };
    });
  }
  function validateActualIntervals(text) {
    const intervals = actualIntervals(text), errors = [];
    for (const interval of intervals) {
      const { entry, start, end } = interval;
      if (end != null && end < start) errors.push(`'${entry.body || entry.id}' ends before it starts`);
      if (!entry.parent) continue;
      const parent = intervals.find(x => x.entry === entry.parent);
      if (!parent) continue;
      if (start < parent.start) errors.push(`'${entry.body || entry.id}' starts before its parent`);
      if (parent.end != null && (start > parent.end || end != null && end > parent.end))
        errors.push(`'${entry.body || entry.id}' falls outside its parent interval`);
    }
    return { ok: errors.length === 0, errors, intervals };
  }
  function scopeToken(body, reg) {
    const token = String(body || "").trim().split(/\s+/, 1)[0];
    if (!token || token.startsWith("[[") || token.startsWith('"')) return null;
    try {
      const ast = parseExpression(token, reg), dnf = toDNF(ast, reg);
      if (dnf.unknown) return null;
      return token;
    } catch (_) { return null; }
  }
  function inheritedRequirement(entry, reg, style = "preserve") {
    const scopes = [];
    for (let p = entry; p; p = p.parent) if (p.role === "main" || p === entry) {
      const scope = scopeToken(p.body, reg); if (scope) scopes.unshift(`(${scope})`);
    }
    if (!scopes.length) return true;
    const source = scopes.join("/");
    return formatExpression(source, reg, style === "preserve" ? (scopes.some(x => x.includes("/")) ? "slash" : reg.raw?.settings?.["new-scope-style"] || "compact") : style);
  }
  function replaceIfUnchanged(current, write) {
    const lines = String(current).split(/\r?\n/);
    if (Array.isArray(write.afterLines)) {
      const actual = lines.slice(write.start, write.start + write.afterLines.length);
      if (actual.length !== write.afterLines.length || actual.some((x, i) => x !== write.afterLines[i])) return { ok: false, text: current };
      lines.splice(write.start, write.afterLines.length, ...(write.beforeLines || []));
      return { ok: true, text: lines.join("\n") };
    }
    if (lines[write.line] !== write.after) return { ok: false, text: current };
    lines.splice(write.line, 1, ...(write.before == null ? [] : [write.before]));
    return { ok: true, text: lines.join("\n") };
  }
  function inlineClassifications(taskText) {
    const matches = [...String(taskText).matchAll(/#t\/([^\s#]+)/gu)].map(m => m[1]);
    return matches.length ? matches.map(x => `(${x})`).join("/") : null;
  }
  function resolveTaskClassification(taskText, pageProject) { return inlineClassifications(taskText) || pageProject || true; }

  return { parseRegistryYaml, tokenize, parseExpression, validateRegistry, classify, formatExpression, shouldShowClassification, parseSection, allBlockIds, ensurePlanIds,
    actualState, actualIntervals, validateActualIntervals, startBlock, endBlock, completedPlanSlugs, dismissBlock, dismissedPlanIds, taskBlockId, doneTaskActuals, editActualTime, progressFor, scopeToken, inheritedRequirement,
    replaceIfUnchanged, inlineClassifications, resolveTaskClassification, hhmm, ensureActual, appendActual };
});

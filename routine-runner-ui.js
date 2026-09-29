/* Routine Runner Obsidian/Dataview UI adapter. */
(async function ({ dv, app, moment, Notice, config }) {
const DIR = dv.current().file.folder;
const CORE_PATH = `${DIR}/routine-runner.js`;
(0, eval)(await app.vault.adapter.read(CORE_PATH));
const RR = globalThis.RoutineRunner;
const EMBED_PATH = `${DIR}/routine-runner-embed.js`;
(0, eval)(await app.vault.adapter.read(EMBED_PATH));
const RRE = globalThis.RoutineRunnerEmbed;
RRE.installStyles(document);
const DEFAULT_ESTIMATE_MS = config.defaultEstimateMs ?? RR.DEFAULT_ESTIMATE_MS;
const REDRAW_INTERVAL_MS = config.redrawIntervalMs ?? 1000;
const { formatDuration } = RR;

const container = dv.container;
container.empty();
container.addClass("rr-root");

let style = document.getElementById("routine-runner-style");
if (!style) {
  style = document.createElement("style");
  style.id = "routine-runner-style";
  document.head.appendChild(style);
}
style.textContent = `
    .rr-root { font-size: var(--font-text-size); }
    .rr-header { display:flex; align-items:center; justify-content:space-between; gap:0.75em; margin-bottom:0.5em; }
    .rr-link { cursor:pointer; font-size:0.85em; color:var(--text-muted); }
    .rr-link:hover { color:var(--text-normal); }
    .rr-note-row { display:flex; align-items:stretch; gap:0.5em; margin-bottom:0.5em; }
    .rr-note-row .rr-input { flex:1 1 auto; min-width:0; width:auto; margin:0; }
    .rr-daily-btn { flex:none; padding:6px 10px; border-radius:6px; border:1px solid var(--background-modifier-border); background:var(--interactive-normal); color:var(--text-normal); cursor:pointer; white-space:nowrap; }
    .rr-daily-btn:hover { background:var(--interactive-hover); }
    .rr-input { width:100%; box-sizing:border-box; padding:6px 10px; border-radius:6px; border:1px solid var(--background-modifier-border); background:var(--background-primary); color:var(--text-normal); margin-bottom:0.5em; }
    .rr-toggle-row { display:flex; align-items:center; gap:0.5em; margin-bottom:0.75em; color:var(--text-muted); font-size:0.9em; }
    .rr-toggle-row label { cursor:pointer; }
    .rr-pick-list { max-height:300px; overflow-y:auto; border:1px solid var(--background-modifier-border); border-radius:6px; margin-bottom:0.75em; }
    .rr-pick-item { display:flex; justify-content:space-between; gap:1em; padding:6px 10px; cursor:pointer; }
    .rr-pick-item:hover { background:var(--background-modifier-hover); }
    .rr-pick-item-active { background:var(--background-modifier-hover); font-weight:600; }
    .rr-section-list { max-height:180px; }
    .rr-section-label { margin-inline-start:calc(var(--rr-section-depth, 0) * 0.625em); }
    .rr-pick-path { color:var(--text-faint); font-size:0.8em; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .rr-empty { color:var(--text-muted); padding:8px 0; }
    .rr-error { color:var(--color-red, #e5534b); padding:8px 10px; margin-bottom:0.75em; border:1px solid var(--color-red, #e5534b); border-radius:6px; }
    .rr-diagnostic { color:var(--text-muted); padding:6px 10px; margin-bottom:0.75em; border-left:3px solid var(--text-faint); font-size:0.85em; }
  `;

// Dataview tears down and re-runs this whole block on a debounced timer whenever
// any file in the vault changes (e.g. when we ourselves edit the routine note on
// Done) — it has no way to know this block doesn't care. A fresh `state` object
// on every run would silently dump the user back to the picker mid-routine, so
// state lives on `window` and survives across those re-executions.
const RR_STATE_KEY = "__routineRunnerState";
const STATE_VERSION = 5;
const CACHE_VERSION = 1;
// Keep live state out of Markdown: Dataview reindexes every changed Markdown
// file, so saving a .md cache causes a delayed full rerender after each action.
const CACHE_NAME = "routine-runner-state.yaml";
const runnerPath = dv.current().file.path;
const runnerDir = runnerPath.includes("/") ? runnerPath.slice(0, runnerPath.lastIndexOf("/")) : "";
const CACHE_PATH = runnerDir ? `${runnerDir}/${CACHE_NAME}` : CACHE_NAME;

const defaultState = {
  version: STATE_VERSION,
  screen: "setup",
  noteQuery: "",
  file: null,
  tasks: [],
  runTasks: [],
  index: 0,
  intervalId: null,
  completedCount: 0,
  leaveUnchecked: false,
  headings: [],
  totalLines: 0,
  allTasks: [],
  sectionIdx: "",
  focusId: null,
  activeLeafId: null,
  sessions: {},
  retiredIds: [],
  totalLeafCount: 0,
  processedLeafCount: 0,
  taskQuery: "",
  collapsedIds: [],
  setupCursorId: null,
  sessionLedger: [],
  cacheError: null,
  cacheWritable: true,
};

const priorState = window[RR_STATE_KEY];
// A Dataview re-run creates a new execution context. Retire the interval owned
// by the previous context up front; the new context starts its own below.
if (priorState?.intervalId) {
  clearInterval(priorState.intervalId);
  priorState.intervalId = null;
}
const state = priorState?.version === STATE_VERSION ? priorState : { ...defaultState };
window[RR_STATE_KEY] = state;

let refs = {};
const COORDINATOR_KEY = "__routineRunnerCoordinator";
const coordinator = window[COORDINATOR_KEY] ?? {
  actionTail: Promise.resolve(),
  saveTail: Promise.resolve(),
  countSaveTimer: null,
  countSaveGeneration: 0,
  latestWrittenCacheText: null,
  generation: 0,
  initialized: false,
  diagnostics: [],
};
window[COORDINATOR_KEY] = coordinator;
const viewGeneration = ++coordinator.generation;

function isCurrentView() { return coordinator.generation === viewGeneration; }

function enqueueAction(action) {
  const run = coordinator.actionTail.catch(() => {}).then(action);
  coordinator.actionTail = run.catch((error) => {
    const saveFailure = state.cacheError?.startsWith(`Could not save ${CACHE_NAME}:`);
    if (!saveFailure) state.cacheError = `Routine action failed: ${error.message}`;
    if (isCurrentView()) render();
    if (!saveFailure) new Notice(state.cacheError, 8000);
  });
  return run;
}

function reportDiagnostics(messages) {
  const unique = [...new Set(messages.filter(Boolean))];
  coordinator.diagnostics = unique;
}

function yamlTools() {
  try { return window.require?.("obsidian") ?? {}; } catch (e) { return {}; }
}

function cacheFrontmatter(text, cacheFile) {
  const match = text.match(/^---[ \t]*\r?\n([\s\S]*?)^---[ \t]*(?:\r?\n|$)/m);
  const yamlText = match ? match[1] : text.trim();
  if (!yamlText) throw new Error("expected YAML state");
  const { parseYaml } = yamlTools();
  let parsed;
  if (typeof parseYaml === "function") {
    parsed = parseYaml(yamlText);
  } else {
    // `window.require("obsidian")` is unavailable in some Obsidian contexts
    // (notably mobile/restricted WebViews). JSON is valid YAML, so files we
    // write can be parsed directly; ordinary hand-edited YAML comes from
    // Obsidian's own metadata cache.
    try { parsed = JSON.parse(yamlText); } catch (e) {
      parsed = match ? app.metadataCache.getFileCache(cacheFile)?.frontmatter : null;
    }
    if (!parsed) throw new Error("Obsidian has not parsed the YAML frontmatter yet");
  }
  if (!parsed || typeof parsed !== "object") throw new Error("frontmatter must be a mapping");
  if (parsed["routine-runner-state-version"] !== CACHE_VERSION) {
    throw new Error(`unsupported state version ${parsed["routine-runner-state-version"] ?? "(missing)"}`);
  }
  if (parsed.routine !== null && parsed.routine !== undefined && typeof parsed.routine !== "object") {
    throw new Error("routine must be a mapping or null");
  }
  if (parsed.sessions !== undefined && !Array.isArray(parsed.sessions)) throw new Error("sessions must be a list");
  for (const session of parsed.sessions ?? []) {
    if (!session || typeof session !== "object" || typeof session["source-file"] !== "string") throw new Error("each session needs a source-file");
    parseStartedAt(session["started-at"]);
  }
  if (parsed.routine && !Array.isArray(parsed.routine.tasks)) throw new Error("routine.tasks must be a list");
  return { version: CACHE_VERSION, routine: parsed.routine ?? null, sessions: parsed.sessions ?? [] };
}

function isoOrNull(ms) {
  return ms == null ? null : new Date(ms).toISOString();
}

function parseStartedAt(value) {
  if (value == null || value === "") return null;
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) throw new Error(`invalid started-at timestamp: ${value}`);
  return ms;
}

function taskRecord(task, map = nodeMap()) {
  return {
    id: task.id,
    parent: task.parentId,
    "task-path": taskPath(task, map).map((part) => part.display),
    "source-line": task.sourceLine,
    "line-hint": task.line,
    retired: state.retiredIds.includes(task.id),
  };
}

function sessionRecord(task, session, map = nodeMap()) {
  return {
    "source-file": state.file.path,
    "ancestry-path": taskPath(task, map).map((part) => part.display),
    "source-line": task.sourceLine,
    "line-hint": task.line,
    "elapsed-before-start": Math.max(0, Math.round(session.elapsedBeforeStartMs || 0)),
    "started-at": isoOrNull(session.startedAt),
    ...(task.goalCount != null || session.count ? { count: Math.max(0, session.count || 0) } : {}),
  };
}

function mergedSessionLedger() {
  if (!state.file || !state.runTasks.length) return [...state.sessionLedger];
  const map = nodeMap();
  const ids = new Set(Object.keys(state.sessions));
  const ledger = state.sessionLedger.filter((entry) => {
    if (entry["source-file"] !== state.file.path) return true;
    const match = matchTaskRecord(entry, flatten(state.runTasks), map, false);
    return !match || !ids.has(match.id);
  });
  for (const [id, session] of Object.entries(state.sessions)) {
    const task = map.get(id);
    if (task) ledger.push(sessionRecord(task, session, map));
  }
  return ledger;
}

function cacheObject() {
  let routine = null;
  if (state.screen === "run" && state.file) {
    const map = nodeMap();
    routine = {
      "source-file": state.file.path,
      section: state.sectionIdx === "" ? null : currentSectionLabel(),
      "section-line-hint": state.sectionIdx === "" ? null : state.headings[Number(state.sectionIdx)]?.line,
      options: { "leave-unchecked": state.leaveUnchecked },
      progress: {
        "completed-count": state.completedCount,
        "total-leaf-count": state.totalLeafCount,
        "processed-leaf-count": state.processedLeafCount,
      },
      "active-leaf": state.activeLeafId,
      "focused-task": state.focusId,
      tasks: flatten(state.runTasks).map((task) => taskRecord(task, map)),
    };
  }
  return { "routine-runner-state-version": CACHE_VERSION, routine, sessions: mergedSessionLedger() };
}

function serializeCache(value) {
  const { stringifyYaml } = yamlTools();
  // Pretty JSON is also valid YAML. This fallback keeps persistence working
  // where Obsidian's CommonJS exports are intentionally not exposed.
  const yaml = typeof stringifyYaml === "function"
    ? stringifyYaml(value).trimEnd()
    : JSON.stringify(value, null, 2);
  return `${yaml}\n`;
}

function queueSave() {
  if (!state.cacheWritable) return Promise.resolve();
  const snapshot = serializeCache(cacheObject());
  const save = coordinator.saveTail.catch(() => {}).then(async () => {
    const existing = app.vault.getAbstractFileByPath(CACHE_PATH);
    if (existing) {
      const current = await app.vault.read(existing);
      if (current !== snapshot) await app.vault.modify(existing, snapshot);
    } else await app.vault.create(CACHE_PATH, snapshot);
    coordinator.latestWrittenCacheText = snapshot;
    coordinator.initialized = true;
    state.cacheError = null;
  }).catch((error) => {
    state.cacheError = `Could not save ${CACHE_NAME}: ${error.message}`;
    new Notice(state.cacheError, 8000);
    throw error;
  });
  coordinator.saveTail = save;
  return save;
}

function scheduleCountSave() {
  if (coordinator.countSaveTimer) clearTimeout(coordinator.countSaveTimer);
  coordinator.countSaveGeneration = viewGeneration;
  coordinator.countSaveTimer = setTimeout(() => {
    coordinator.countSaveTimer = null;
    // State is shared, so a replacement view may safely inherit this debounce.
    enqueueAction(queueSave);
  }, 300);
}

async function flushCountSave() {
  if (coordinator.countSaveTimer) {
    clearTimeout(coordinator.countSaveTimer);
    coordinator.countSaveTimer = null;
    await queueSave();
  } else {
    await coordinator.saveTail.catch(() => {});
  }
}

async function loadFileData(file) {
  const content = await app.vault.read(file);
  return RR.parseRoutineText(content, DEFAULT_ESTIMATE_MS);
}

// A section runs from just after its heading to the next heading of the
// same or higher level (fewer #'s), or end of file.
function sectionLineRange(headings, totalLines, idx) {
  return RR.sectionLineRange(headings, totalLines, idx);
}

function currentSectionLabel() {
  if (state.sectionIdx === "") return null;
  const h = state.headings[parseInt(state.sectionIdx, 10)];
  return h ? h.text : null;
}

function recomputeTasksForSection() {
  const range = state.sectionIdx === ""
    ? { start: 0, end: state.totalLines }
    : sectionLineRange(state.headings, state.totalLines, parseInt(state.sectionIdx, 10));
  const included = new Map();
  const sourceById = new Map(state.allTasks.map((node) => [node.id, node]));
  for (const source of state.allTasks) {
    if (source.line < range.start || source.line >= range.end) continue;
    let blocked = source.checked;
    for (let parentId = source.parentId; parentId && !blocked;) {
      const parent = sourceById.get(parentId);
      blocked = parent.checked;
      parentId = parent.parentId;
    }
    if (blocked) continue;
    included.set(source.id, { ...source, children: [], parentId: null, selected: true });
  }
  for (const node of included.values()) {
    const source = sourceById.get(node.id);
    if (source.parentId && included.has(source.parentId)) {
      node.parentId = source.parentId;
      included.get(source.parentId).children.push(node);
    }
  }
  state.tasks = [...included.values()].filter((n) => !n.parentId);
}

function applySection(idx) {
  state.sectionIdx = idx;
  recomputeTasksForSection();
  render();
}

function fuzzyScore(query, text) {
  return RR.fuzzyScore(query, text);
}

const VIEW_LIFECYCLE_KEY = "__routineRunnerViewCleanup";

// A Dataview rerun replaces this execution. Tear down the previous view's
// observer/listeners before installing this one's lifecycle hooks.
if (typeof window[VIEW_LIFECYCLE_KEY] === "function") {
  window[VIEW_LIFECYCLE_KEY]();
}

function stopTimer() {
  refs.sharedDispose?.();
}

function flatten(nodes) {
  return RR.flatten(nodes);
}

function nodeMap(nodes = state.runTasks) {
  return RR.nodeMap(nodes);
}

function effective(node, map) {
  return RR.effective(node, map);
}

function enabledLeaves(nodes) {
  return RR.enabledLeaves(nodes);
}

function selectedRoutineTree(nodes) {
  return RR.selectedRoutineTree(nodes);
}

function currentTask() {
  return nodeMap().get(state.focusId) || null;
}

function currentSession() {
  if (!state.focusId) return null;
  return state.sessions[state.focusId] || (state.sessions[state.focusId] = {
    elapsedBeforeStartMs: 0,
    startedAt: null,
    count: 0,
  });
}

function elapsedForSession(session, now = Date.now()) {
  return RR.elapsedForSession(session, now);
}

function settleSession(session, now = Date.now()) {
  if (!session || session.startedAt === null) return;
  session.elapsedBeforeStartMs = (Number(session.elapsedBeforeStartMs) || 0) + Math.max(0, now - Number(session.startedAt));
  session.startedAt = null;
}

function activateCurrentSession(now = Date.now()) {
  const session = currentSession();
  if (session && session.startedAt === null) session.startedAt = now;
}

function taskPath(node, map = nodeMap()) {
  return RR.taskPath(node, map);
}

function pathLabel(node, map = nodeMap()) {
  return taskPath(node, map).map((part) => part.display).join(" → ");
}

function arraysEqual(a, b) {
  return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((item, i) => item === b[i]);
}

// Identity is deliberately source-based instead of being written into task lines.
// Exact text and ancestry dominate; the old line number breaks nearby ties.
function matchTaskRecord(record, candidates, map, reportAmbiguity = true) {
  const source = record?.["source-line"];
  const path = record?.["task-path"] ?? record?.["ancestry-path"];
  const hint = Number(record?.["line-hint"]);
  const scored = candidates.map((task) => {
    const candidatePath = taskPath(task, map).map((part) => part.display);
    let score = 0;
    if (source === task.sourceLine) score += 100;
    if (arraysEqual(path, candidatePath)) score += 80;
    if (path?.at(-1) === candidatePath.at(-1)) score += 20;
    const distance = Number.isFinite(hint) ? Math.abs(task.line - hint) : 100000;
    if (arraysEqual(path?.slice(0, -1), candidatePath.slice(0, -1))) score += 60;
    if (distance === 0) score += 70;
    else if (distance <= 3) score += 30 - distance * 5;
    return { task, score, distance };
  }).filter((item) => item.score >= 70)
    .sort((a, b) => b.score - a.score || a.distance - b.distance);
  if (!scored.length) return null;
  if (scored.length > 1 && scored[0].score === scored[1].score && scored[0].distance === scored[1].distance) {
    if (reportAmbiguity) return { ambiguous: true };
    return null;
  }
  return scored[0].task;
}

function removeSessionsForIds(ids) {
  const remove = new Set(ids);
  for (const id of remove) delete state.sessions[id];
  if (!state.file) return;
  const map = nodeMap();
  state.sessionLedger = state.sessionLedger.filter((entry) => {
    if (entry["source-file"] !== state.file.path) return true;
    const task = matchTaskRecord(entry, flatten(state.runTasks), map, false);
    return !task || !remove.has(task.id);
  });
}

function hydrateSessions() {
  state.sessions = {};
  const tasks = flatten(state.runTasks);
  const map = nodeMap();
  const warnings = [];
  for (const entry of state.sessionLedger) {
    if (entry?.["source-file"] !== state.file.path) continue;
    const match = matchTaskRecord(entry, tasks, map);
    if (!match) { warnings.push(`Unmatched cached session near line ${entry?.["line-hint"] ?? "?"}`); continue; }
    if (match.ambiguous) { warnings.push(`Ambiguous cached session near line ${entry?.["line-hint"] ?? "?"}`); continue; }
    if (state.sessions[match.id]) { warnings.push(`Multiple cached sessions matched “${match.display}”`); continue; }
    state.sessions[match.id] = {
      elapsedBeforeStartMs: Math.max(0, Number(entry["elapsed-before-start"]) || 0),
      startedAt: parseStartedAt(entry["started-at"]),
      count: Math.max(0, Number(entry.count) || 0),
    };
  }
  // A malformed/manual edit must not create several live clocks.
  for (const [id, session] of Object.entries(state.sessions)) {
    if (id !== state.focusId && session.startedAt !== null) session.startedAt = null;
  }
  // Unmatched and ambiguous records stay in the ledger. Guessing would risk
  // attaching elapsed time to an unrelated task after source edits.
  reportDiagnostics(warnings);
}

function ledgerEntryMatchesRecord(entry, record) {
  return entry?.["source-file"] === state.file?.path
    && (entry["source-line"] === record?.["source-line"]
      || arraysEqual(entry["ancestry-path"], record?.["task-path"]));
}

async function restoreRoutine(saved) {
  const file = app.vault.getAbstractFileByPath(saved?.["source-file"] ?? "");
  if (!file) throw new Error(`routine source file not found: ${saved?.["source-file"] ?? "(missing)"}`);
  state.file = file;
  const data = await loadFileData(file);
  state.headings = data.headings;
  state.totalLines = data.totalLines;
  state.allTasks = data.tasks;
  if (saved.section == null) state.sectionIdx = "";
  else {
    const choices = data.headings.map((h, idx) => ({ h, idx })).filter(({ h }) => h.text === saved.section);
    choices.sort((a, b) => Math.abs(a.h.line - Number(saved["section-line-hint"])) - Math.abs(b.h.line - Number(saved["section-line-hint"])));
    state.sectionIdx = choices.length ? String(choices[0].idx) : "";
  }
  recomputeTasksForSection();
  const available = flatten(state.tasks);
  const availableMap = nodeMap(state.tasks);
  const used = new Set();
  const restored = [];
  const warnings = [];
  let pruned = false;
  for (const record of saved.tasks ?? []) {
    const match = matchTaskRecord(record, available.filter((t) => !used.has(t.id)), availableMap);
    const label = (record?.["task-path"] ?? []).join(" → ") || record?.["source-line"] || "unknown task";
    if (!match) {
      pruned = true;
      if (record?.retired) {
        state.sessionLedger = state.sessionLedger.filter((entry) => !ledgerEntryMatchesRecord(entry, record));
      } else {
        warnings.push(`Missing cached task “${label}” (formerly near line ${record?.["line-hint"] ?? "?"})`);
      }
      continue;
    }
    if (match.ambiguous) { pruned = true; warnings.push(`Removed ambiguous routine task “${label}” (formerly near line ${record?.["line-hint"] ?? "?"})`); continue; }
    used.add(match.id);
    restored.push({ ...match, id: record.id, parentId: record.parent ?? null, children: [] });
  }
  const restoredMap = new Map(restored.map((task) => [task.id, task]));
  for (const task of restored) if (task.parentId && restoredMap.has(task.parentId)) restoredMap.get(task.parentId).children.push(task);
  state.runTasks = restored.filter((task) => !task.parentId || !restoredMap.has(task.parentId));
  if (!state.runTasks.length) {
    state.retiredIds = [];
    state.sessions = {};
    state.completedCount = Math.max(0, Number(saved.progress?.["completed-count"]) || 0);
    state.totalLeafCount = Math.max(0, Number(saved.progress?.["total-leaf-count"]) || 0);
    state.processedLeafCount = Math.max(0, Number(saved.progress?.["processed-leaf-count"]) || 0);
    state.screen = "done";
    reportDiagnostics(warnings);
    return true;
  }
  state.retiredIds = (saved.tasks ?? []).filter((task) => task.retired).map((task) => task.id).filter((id) => restoredMap.has(id));
  state.leaveUnchecked = Boolean(saved.options?.["leave-unchecked"]);
  state.completedCount = Math.max(0, Number(saved.progress?.["completed-count"]) || 0);
  state.totalLeafCount = Math.max(0, Number(saved.progress?.["total-leaf-count"]) || enabledLeaves(state.runTasks).length);
  state.processedLeafCount = Math.max(0, Number(saved.progress?.["processed-leaf-count"]) || 0);
  state.activeLeafId = restoredMap.has(saved["active-leaf"]) ? saved["active-leaf"] : enabledLeaves(state.runTasks).find((t) => !state.retiredIds.includes(t.id))?.id;
  state.focusId = restoredMap.has(saved["focused-task"]) ? saved["focused-task"] : state.activeLeafId;
  if (!state.activeLeafId || !state.focusId) throw new Error("cached routine has no remaining active task");
  state.screen = "run";
  hydrateSessions();
  reportDiagnostics([...coordinator.diagnostics, ...warnings]);
  return pruned;
}

function render() {
  // Done edits the source note before it advances and saves. That edit can
  // trigger a Dataview rerun while the old action is still on the action queue.
  // Prevent the retiring execution from clearing/rebuilding UI after the new
  // generation has taken ownership of the view.
  if (!isCurrentView()) return;
  refs.sharedDispose?.();
  container.empty();
  refs = {};
  RRE.renderPurgeCacheButton(container, {
    onPurge: async () => {
      await enqueueAction(resetMissingCache);
      new Notice("Routine Runner cache purged");
    },
  });
  if (state.cacheError) container.createDiv({ cls: "rr-error", text: state.cacheError });
  if (coordinator.diagnostics.length) container.createDiv({
    cls: "rr-diagnostic",
    text: `Cache note: ${coordinator.diagnostics.join(" · ")}`,
  });
  if (state.screen === "run") renderRun();
  else if (state.screen === "done") renderDone();
  else renderSetup();
}

function renderNoteCombo() {
  const row = container.createDiv({ cls: "rr-note-row" });
  const input = row.createEl("input", {
    cls: "rr-input",
    attr: { type: "text", placeholder: "Type a note name…" },
  });
  const dailyBtn = row.createEl("button", {
    cls: "rr-daily-btn",
    text: "Today",
    attr: { type: "button", title: "Use today's Daily Note" },
  });
  input.value = state.file ? state.file.basename : state.noteQuery;
  const list = container.createDiv({ cls: "rr-pick-list" });
  list.style.display = "none";

  dailyBtn.addEventListener("click", async () => {
    const dailyNotes = app.internalPlugins?.getPluginById?.("daily-notes");
    if (!dailyNotes?.enabled || !dailyNotes.instance) {
      new Notice("Enable Obsidian's Daily notes core plugin to use this shortcut.", 6000);
      return;
    }

    const options = dailyNotes.instance.options ?? {};
    const format = options.format || "YYYY-MM-DD";
    const folder = String(options.folder || "").replace(/^\/+|\/+$/g, "");
    const datedPath = window.moment().format(format).replace(/^\/+|\/+$/g, "");
    const path = [folder, datedPath].filter(Boolean).join("/") + ".md";
    const file = app.vault.getAbstractFileByPath(path);
    if (!file || file.extension !== "md") {
      new Notice(`Today's Daily Note was not found at ${path}.`, 6000);
      return;
    }

    list.style.display = "none";
    await selectFile(file);
  });

  function renderList(query) {
    list.empty();
    const files = app.vault.getMarkdownFiles().filter((file) => file.path !== CACHE_PATH);
    let matches;
    if (!query || query.trim() === "") {
      matches = files
        .slice()
        .sort((a, b) => a.basename.localeCompare(b.basename))
        .slice(0, 25)
        .map((f) => ({ file: f }));
    } else {
      matches = files
        .map((f) => ({ file: f, score: fuzzyScore(query, f.basename) }))
        .filter((m) => m.score >= 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 25);
    }
    if (matches.length === 0) {
      list.createDiv({ cls: "rr-empty", text: "No matching notes." });
      return;
    }
    matches.forEach(({ file }) => {
      const item = list.createDiv({ cls: "rr-pick-item" });
      item.createSpan({ text: file.basename });
      if (file.parent && file.parent.path !== "/") {
        item.createSpan({ cls: "rr-pick-path", text: file.parent.path });
      }
      item.addEventListener("mousedown", (e) => {
        e.preventDefault();
        list.style.display = "none";
        selectFile(file);
      });
    });
  }

  input.addEventListener("focus", () => {
    list.style.display = "block";
    renderList("");
  });
  input.addEventListener("input", () => {
    state.noteQuery = input.value;
    renderList(input.value);
  });
  input.addEventListener("blur", () => {
    list.style.display = "none";
    input.value = state.file ? state.file.basename : state.noteQuery;
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      const first = list.querySelector(".rr-pick-item");
      if (first) first.dispatchEvent(new MouseEvent("mousedown"));
    } else if (e.key === "Escape") {
      list.style.display = "none";
      input.blur();
    }
  });

  if (!state.file) input.focus();
}

function renderSectionCombo() {
  const input = container.createEl("input", {
    cls: "rr-input",
    attr: { type: "text", placeholder: "Filter sections… (leave blank for whole note)" },
  });
  input.value = currentSectionLabel() ?? "Whole note";
  const list = container.createDiv({ cls: "rr-pick-list rr-section-list" });
  list.style.display = "none";

  function options() {
    return [{ idx: "", text: "Whole note" }].concat(
      state.headings.map((h, idx) => ({ idx: String(idx), text: h.text, level: h.level }))
    );
  }

  function renderList(query) {
    list.empty();
    const opts = options();
    let matches;
    if (!query || query.trim() === "") {
      matches = opts;
    } else {
      matches = opts
        .map((o) => ({ ...o, score: fuzzyScore(query, o.text) }))
        .filter((o) => o.score >= 0)
        .sort((a, b) => b.score - a.score);
    }
    if (matches.length === 0) {
      list.createDiv({ cls: "rr-empty", text: "No matching sections." });
      return;
    }
    matches.forEach((o) => {
      const item = list.createDiv({ cls: "rr-pick-item" });
      if (o.idx === state.sectionIdx) item.addClass("rr-pick-item-active");
      const label = item.createSpan({ cls: "rr-section-label", text: o.text });
      label.style.setProperty("--rr-section-depth", String(o.level ? o.level - 1 : 0));
      item.addEventListener("mousedown", (e) => {
        e.preventDefault();
        list.style.display = "none";
        applySection(o.idx);
      });
    });
  }

  input.addEventListener("focus", () => {
    list.style.display = "block";
    renderList("");
  });
  input.addEventListener("input", () => {
    renderList(input.value);
  });
  input.addEventListener("blur", () => {
    list.style.display = "none";
    input.value = currentSectionLabel() ?? "Whole note";
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      const first = list.querySelector(".rr-pick-item");
      if (first) first.dispatchEvent(new MouseEvent("mousedown"));
    } else if (e.key === "Escape") {
      list.style.display = "none";
      input.blur();
    }
  });
}

function renderSetup() {
  container.createEl("h3", { text: "Run a routine" });

  const toggleRow = container.createDiv({ cls: "rr-toggle-row" });
  const toggleId = "rr-leave-unchecked-" + Math.random().toString(36).slice(2);
  const toggle = toggleRow.createEl("input", {
    attr: { type: "checkbox", id: toggleId },
  });
  toggle.checked = state.leaveUnchecked;
  toggle.addEventListener("change", () => {
    state.leaveUnchecked = toggle.checked;
  });
  toggleRow.createEl("label", {
    text: "Leave tasks unchecked (don't record completion)",
    attr: { for: toggleId },
  });

  renderNoteCombo();

  if (!state.file) return;

  if (state.headings.length > 0) {
    renderSectionCombo();
  }

  if (state.tasks.length === 0) {
    container.createDiv({ cls: "rr-empty", text: "No open tasks (- [ ]) found in this section." });
    return;
  }

  const selectedCount = enabledLeaves(state.tasks).length;
  const startBtn = container.createEl("button", {
    cls: "rr-btn rr-btn-primary",
    text: selectedCount > 0
      ? `Start routine (${selectedCount} leaf task${selectedCount === 1 ? "" : "s"})`
      : "Select at least one leaf task",
  });
  startBtn.disabled = selectedCount === 0;
  startBtn.addEventListener("click", () => enqueueAction(async () => {
    // Persist only enabled leaves and the ancestors needed to retain their paths.
    state.runTasks = selectedRoutineTree(state.tasks);
    const leaves = enabledLeaves(state.runTasks);
    state.index = 0;
    state.activeLeafId = leaves[0].id;
    state.focusId = leaves[0].id;
    state.sessions = {};
    state.retiredIds = [];
    state.totalLeafCount = leaves.length;
    state.processedLeafCount = 0;
    state.completedCount = 0;
    state.screen = "run";
    hydrateSessions();
    activateCurrentSession();
    render();
    await queueSave();
  }));

  RRE.renderSelection(container, {
    state,
    tasks: state.tasks,
    render,
    onReset: recomputeTasksForSection,
  });
}

async function selectFile(file) {
  state.file = file;
  state.noteQuery = "";
  state.taskQuery = "";
  state.collapsedIds = [];
  state.setupCursorId = null;
  const data = await loadFileData(file);
  state.headings = data.headings;
  state.totalLines = data.totalLines;
  state.allTasks = data.tasks;
  state.sectionIdx = "";
  recomputeTasksForSection();
  state.index = 0;
  state.completedCount = 0;
  state.screen = "setup";
  render();
}

async function stopRoutine() {
  await flushCountSave();
  settleSession(currentSession());
  stopTimer();
  const keepId = state.focusId;
  removeSessionsForIds(Object.keys(state.sessions).filter((id) => id !== keepId));
  state.screen = "setup";
  await queueSave();
  if (state.file) {
    const data = await loadFileData(state.file);
    state.headings = data.headings;
    state.totalLines = data.totalLines;
    state.allTasks = data.tasks;
    recomputeTasksForSection();
  }
  state.runTasks = [];
  render();
}

function renderRun() {
  const map = nodeMap();
  const task = currentTask();
  const session = currentSession();
  const leaves = enabledLeaves(state.runTasks);
  const activeIndex = leaves.findIndex((leaf) => leaf.id === state.activeLeafId);
  const runLabel = currentSectionLabel();
  const path = taskPath(map.get(state.activeLeafId), map);
  const retired = new Set(state.retiredIds);
  flatten([task]).forEach((node) => retired.add(node.id));
  const next = leaves.slice(activeIndex + 1).find((leaf) => !retired.has(leaf.id));
  const view = RRE.renderRunCard(container, {
    app, task, session, path, redrawIntervalMs: REDRAW_INTERVAL_MS,
    progressLabel: `Leaf ${state.processedLeafCount + 1} of ${state.totalLeafCount} — ${state.file.basename}${runLabel ? " › " + runLabel : ""}`,
    nextLabel: next ? `Next: ${pathLabel(next, map)} (${formatDuration(next.estimateMs)})` : null,
    onStop: () => enqueueAction(stopRoutine),
    onFocus: part => enqueueAction(() => focusTask(part.id)),
    onStateChange: scheduleCountSave,
    onPause: () => { if (session.startedAt === null) session.startedAt = Date.now(); else settleSession(session); enqueueAction(queueSave); },
    onSkip: () => enqueueAction(() => advance(false)),
    onDone: status => enqueueAction(() => completeCurrentTask(status)),
    onComment: (task, comment) => enqueueAction(async () => {
      const original = task.sourceLine;
      const updated = await RRE.saveTaskComment(app, state.file, task, comment);
      for (const node of [...state.allTasks, ...flatten(state.tasks), ...flatten(state.runTasks)]) {
        if (node.id === task.id && node.sourceLine === original) Object.assign(node, updated);
      }
      Object.assign(task, updated);
      await queueSave();
    }),
  });
  refs.sharedDispose = view.dispose;
}

function renderDone() {
  stopTimer();
  RRE.renderSummary(container, { processedCount: state.processedLeafCount, totalLeafCount: state.totalLeafCount, completedCount: state.completedCount }, {
    actionLabel: "Run another note",
    onAction: () => {
    state.file = null;
    state.noteQuery = "";
    state.headings = [];
    state.totalLines = 0;
    state.allTasks = [];
    state.tasks = [];
    state.runTasks = [];
    state.sectionIdx = "";
    state.screen = "setup";
    render();
    },
  });
}

async function focusTask(id) {
  await flushCountSave();
  const departingId = state.focusId;
  settleSession(currentSession());
  removeSessionsForIds([departingId]);
  state.focusId = id;
  activateCurrentSession();
  render();
  await queueSave();
}

async function advance(wasDone) {
  await flushCountSave();
  settleSession(currentSession());
  if (wasDone) state.completedCount++;
  const focused = currentTask();
  const retired = new Set(state.retiredIds);
  const branchIds = new Set(flatten([focused]).map((node) => node.id));
  removeSessionsForIds(branchIds);
  branchIds.forEach((id) => retired.add(id));
  const leaves = enabledLeaves(state.runTasks);
  const affectedLeaves = leaves.filter((leaf) => branchIds.has(leaf.id) && !state.retiredIds.includes(leaf.id));
  state.processedLeafCount += affectedLeaves.length;
  state.retiredIds = [...retired];
  const activeIndex = leaves.findIndex((leaf) => leaf.id === state.activeLeafId);
  const next = leaves.slice(activeIndex + 1).find((leaf) => !retired.has(leaf.id));
  if (next) {
    state.index++;
    state.activeLeafId = next.id;
    state.focusId = next.id;
    state.screen = "run";
    activateCurrentSession();
  } else {
    state.screen = "done";
  }
  render();
  await queueSave();
}

// Terminal status choices first use Tasks' completion transformation so recurrence
// and on-completion behavior are preserved. The completed occurrence is then
// converted to the chosen symbol and its date marker is normalized for that type.
async function completeCurrentTask(selectedStatus = null) {
  if (state.leaveUnchecked) {
    await advance(true);
    return;
  }

  const task = currentTask();
  const session = currentSession();
  const content = await app.vault.read(state.file);
  const lines = content.split("\n");
  let rawLine = lines[task.line];

  if (rawLine !== task.sourceLine) {
    const matches = [];
    lines.forEach((line, idx) => {
      if (line === task.sourceLine) matches.push(idx);
    });

    if (matches.length === 1) {
      task.line = matches[0];
      rawLine = lines[task.line];
    } else {
      const reason = matches.length === 0
        ? "it could not be found in the note"
        : "more than one identical task was found in the note";
      new Notice(
        `Could not complete “${task.display}”: ${reason}. Stop and restart the routine to reload the tasks.`,
        8000,
      );
      return;
    }
  }

  // Both hosts use the same Tasks-plugin transformation and 🏁/🥅 result metadata.
  const nextContent = await RRE.completeTask(app, state.file, content, task.line, selectedStatus, {
    elapsedMs: elapsedForSession(session), count: session.count, goalCount: task.goalCount,
  });
  const shift = nextContent.split(/\r?\n/).length - lines.length;
  if (shift !== 0) {
    flatten(state.runTasks).forEach((t) => { if (t.line > task.line) t.line += shift; });
  }

  await advance(true);
}

async function resetMissingCache() {
  state.sessionLedger = [];
  state.sessions = {};
  state.runTasks = [];
  state.retiredIds = [];
  state.activeLeafId = null;
  state.focusId = null;
  state.index = 0;
  state.completedCount = 0;
  state.totalLeafCount = 0;
  state.processedLeafCount = 0;
  state.cacheError = null;
  state.cacheWritable = true;
  state.screen = "setup";
  coordinator.diagnostics = [];
  coordinator.latestWrittenCacheText = null;
  coordinator.initialized = false;
  render();
  await queueSave();
}

async function initializeFromCache() {
  // A source-note-triggered Dataview rerun can arrive while the previous view is
  // between editing the source note and committing its new cache snapshot.
  // Never inspect disk until that complete transaction and its writes settle.
  if (coordinator.countSaveTimer) {
    clearTimeout(coordinator.countSaveTimer);
    coordinator.countSaveTimer = null;
    enqueueAction(queueSave);
  }
  // Recheck the tail identities: an action completing while we await it may
  // have appended a save, and a transferred debounce may append an action.
  while (true) {
    const actionTail = coordinator.actionTail;
    await actionTail.catch(() => {});
    const saveTail = coordinator.saveTail;
    await saveTail.catch(() => {});
    if (actionTail === coordinator.actionTail && saveTail === coordinator.saveTail) break;
  }
  if (!isCurrentView()) return;

  const cacheFile = app.vault.getAbstractFileByPath(CACHE_PATH);
  if (!cacheFile) {
    await resetMissingCache();
    return;
  }
  try {
    const cacheText = await app.vault.read(cacheFile);
    if (!isCurrentView()) return;
    if (!cacheText.trim()) {
      await resetMissingCache();
      return;
    }

    // A source-note edit can rerun Dataview after this cache snapshot was
    // written. The shared state is already newer and fully validated, so
    // reloading identical bytes could reset a timer or replay navigation.
    if (coordinator.initialized && cacheText === coordinator.latestWrittenCacheText) {
      state.cacheError = null;
      state.cacheWritable = true;
      render();
      return;
    }

    const cached = cacheFrontmatter(cacheText, cacheFile);
    state.cacheError = null;
    state.cacheWritable = true;
    coordinator.diagnostics = [];
    state.sessionLedger = cached.sessions;
    if (cached.routine) {
      const routinePruned = await restoreRoutine(cached.routine);
      // Preserve the persisted paused/running state. A non-null started-at
      // naturally accounts for time spent closed; intervals only repaint.
      render();
      // Persist the successfully restored subset once so stale/ambiguous task
      // records do not warn again on every Dataview rerun.
      if (routinePruned) queueSave();
    } else {
      state.screen = "setup";
      state.runTasks = [];
      state.sessions = {};
      render();
    }
    coordinator.initialized = true;
    // A manual/foreign edit must remain distinguishable from our last write.
    coordinator.latestWrittenCacheText = null;
  } catch (error) {
    state.cacheWritable = false;
    state.cacheError = `${CACHE_NAME} was not loaded: ${error.message}. Fix its YAML and rerun this block; it will not be overwritten.`;
    render();
  }
}

await initializeFromCache();

let containerAttached = document.body.contains(container);

function syncViewAttachment() {
  const isAttached = document.body.contains(container);
  if (isAttached === containerAttached) return;
  containerAttached = isAttached;
  if (!isAttached) {
    // Keep timestamp-based session time running, but suspend work that only
    // serves this view while Obsidian has its DOM detached.
    stopTimer();
    return;
  }
  if (state.screen === "run") render();
}

const watchdog = new MutationObserver(syncViewAttachment);
watchdog.observe(document.body, { childList: true, subtree: true });

const cleanupView = () => {
  watchdog.disconnect();
  stopTimer();
  if (window[VIEW_LIFECYCLE_KEY] === cleanupView) delete window[VIEW_LIFECYCLE_KEY];
};
window[VIEW_LIFECYCLE_KEY] = cleanupView;
})(globalThis.__routineRunnerEntry);

/* Routine Runner Obsidian/Dataview UI adapter. */
(async function ({ dv, app, moment, Notice, config }) {
const DIR = dv.current().file.folder;
const CORE_PATH = `${DIR}/routine-runner.js`;
(0, eval)(await app.vault.adapter.read(CORE_PATH));
const RR = globalThis.RoutineRunner;
const EMBED_PATH = `${DIR}/routine-runner-embed.js`;
(0, eval)(await app.vault.adapter.read(EMBED_PATH));
const RRE = globalThis.RoutineRunnerEmbed;
const DEFAULT_ESTIMATE_MS = config.defaultEstimateMs ?? RR.DEFAULT_ESTIMATE_MS;
const REDRAW_INTERVAL_MS = config.redrawIntervalMs ?? 1000;
const { TASK_LINE_RE, insertBeforeTasksMetadata, formatDuration } = RR;

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
    .rr-setup-tools { position:sticky; top:0; z-index:2; padding:0.55em; margin-bottom:0.6em; border:1px solid var(--background-modifier-border); border-radius:6px; background:var(--background-primary); box-shadow:0 2px 8px rgba(0,0,0,0.12); }
    .rr-tools-row { display:flex; align-items:center; flex-wrap:wrap; gap:0.4em; }
    .rr-tools-row + .rr-tools-row { margin-top:0.45em; }
    .rr-tools-row .rr-input { flex:1 1 14em; width:auto; margin:0; }
    .rr-tool-btn { padding:4px 8px; font-size:0.82em; border-radius:5px; border:1px solid var(--background-modifier-border); background:var(--interactive-normal); color:var(--text-normal); cursor:pointer; }
    .rr-tool-btn:hover { background:var(--interactive-hover); }
    .rr-reset-btn { margin-left:auto; }
    .rr-summary { margin-left:auto; color:var(--text-muted); font-size:0.85em; white-space:nowrap; }
    .rr-review-list { display:grid; grid-template-columns:minmax(0,1fr) auto auto auto; align-items:stretch; column-gap:0; padding:0 10px; border:1px solid var(--background-modifier-border); border-radius:6px; margin-bottom:0.75em; }
    .rr-review-item { display:contents; }
    .rr-review-item > * { padding:6px 0; border-bottom:1px solid var(--background-modifier-border); box-sizing:border-box; }
    .rr-review-list > .rr-review-item:last-child > * { border-bottom:none; }
    .rr-review-item-disabled > * { opacity:0.45; }
    .rr-review-item-disabled .rr-review-text { text-decoration:line-through; }
    .rr-review-item-context .rr-review-label { color:var(--text-muted); font-style:italic; }
    .rr-review-item-active > * { background:var(--background-modifier-hover); }
    .rr-review-text { display:flex; align-items:center; min-width:0; }
    .rr-disclosure { flex:none; width:1.4em; margin-left:0.35em; padding:0; border:0; background:transparent; color:var(--text-muted); cursor:pointer; }
    .rr-review-label { min-width:0; overflow:hidden; text-overflow:ellipsis; }
    .rr-badge { color:var(--text-muted); font-size:0.8em; background:var(--background-secondary); border-radius:4px; padding:1px 6px; white-space:nowrap; }
    .rr-badge-group { display:flex; align-items:center; justify-content:flex-end; gap:0.4em; padding-left:0.6em; }
    .rr-checkbox-cell { display:flex; align-items:center; justify-content:center; padding-left:0.6em; }
    .rr-reorder { display:flex; align-items:center; justify-content:center; gap:2px; padding-left:0.6em; }
    .rr-reorder-btn { line-height:1; font-size:0.7em; padding:2px 6px; border-radius:4px; border:1px solid var(--background-modifier-border); background:var(--interactive-normal); color:var(--text-normal); cursor:pointer; }
    .rr-reorder-btn:hover:not(:disabled) { background:var(--interactive-hover); }
    .rr-reorder-btn:disabled { opacity:0.3; cursor:default; }
    .rr-card { border:1px solid var(--background-modifier-border); border-radius:8px; padding:1em; background:var(--background-secondary); }
    .rr-task-text { font-size:1.15em; font-weight:600; margin-bottom:0.25em; }
    .rr-crumb { cursor:pointer; color:var(--interactive-accent); }
    .rr-crumb-current { cursor:default; color:var(--text-normal); }
    .rr-crumb-sep { color:var(--text-faint); padding:0 0.35em; }
    .rr-est { color:var(--text-muted); font-size:0.85em; margin-bottom:0.75em; }
    .rr-timer-row { text-align:center; }
    .rr-timer { font-size:2.2em; font-weight:700; font-variant-numeric:tabular-nums; color:var(--text-normal); }
    .rr-timer.rr-overdue { color:var(--color-red, #e5534b); }
    .rr-bar { height:10px; border-radius:5px; background:var(--background-modifier-border); overflow:hidden; margin:0.75em 0 1em; }
    .rr-bar-fill { height:100%; width:0%; background:var(--color-green, #4caf50); transition:width 0.2s linear, background-color 0.2s linear; }
    .rr-bar-fill.rr-overdue { background:var(--color-red, #e5534b); }
    .rr-count-row { display:flex; align-items:center; justify-content:center; gap:0.6em; margin:0.75em 0 1em; }
    .rr-count-btn { flex:none; width:2.4em; font-size:1.2em; padding:6px 0; }
    .rr-count-value { font-size:1.8em; font-weight:700; min-width:1.4em; text-align:center; cursor:pointer; border-bottom:1px dashed var(--text-faint); }
    .rr-count-value:hover { color:var(--interactive-accent); }
    .rr-count-sep { color:var(--text-muted); font-size:1.4em; }
    .rr-count-goal { color:var(--text-muted); font-size:1.4em; font-weight:600; }
    .rr-count-input { font-size:1.8em; font-weight:700; width:3.2em; text-align:center; border-radius:4px; border:1px solid var(--background-modifier-border); background:var(--background-primary); color:var(--text-normal); }
    .rr-btn-row { display:flex; gap:0.5em; }
    .rr-btn { flex:1; padding:8px; border-radius:6px; border:1px solid var(--background-modifier-border); background:var(--interactive-normal); color:var(--text-normal); cursor:pointer; }
    .rr-btn:hover { background:var(--interactive-hover); }
    .rr-btn:disabled { opacity:0.5; cursor:default; }
    .rr-btn-primary { background:var(--interactive-accent); color:var(--text-on-accent); border-color:var(--interactive-accent); }
    .rr-btn-primary:hover { background:var(--interactive-accent-hover); }
    .rr-status-menu { position:fixed; z-index:var(--layer-menu, 1000); min-width:190px; max-height:60vh; overflow:auto; padding:4px; border:1px solid var(--background-modifier-border); border-radius:6px; background:var(--background-primary); box-shadow:var(--shadow-s); }
    .rr-status-option { display:flex; width:100%; gap:0.6em; align-items:center; padding:6px 9px; border:0; border-radius:4px; background:transparent; color:var(--text-normal); text-align:left; cursor:pointer; }
    .rr-status-option:hover, .rr-status-option:focus { background:var(--background-modifier-hover); }
    .rr-status-symbol { min-width:2.2em; font-family:var(--font-monospace); }
    .rr-status-type { margin-left:auto; color:var(--text-muted); font-size:0.8em; }
    .rr-btn-stop { flex:none; padding:4px 14px; font-size:0.85em; border-radius:6px; border:1px solid var(--background-modifier-border); background:var(--interactive-normal); color:var(--text-normal); cursor:pointer; }
    .rr-btn-stop:hover { background:var(--interactive-hover); }
    .rr-next { margin-top:0.75em; color:var(--text-muted); font-size:0.9em; }
    .rr-progress-label { font-weight:600; }
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
let statusMenuEl = null;
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

let wakeLock = null;
let localIntervalId = null;
let disposed = false;
const VIEW_LIFECYCLE_KEY = "__routineRunnerViewCleanup";

// A Dataview rerun replaces this execution. Tear down the previous view's
// observer/listeners before installing this one's lifecycle hooks.
if (typeof window[VIEW_LIFECYCLE_KEY] === "function") {
  window[VIEW_LIFECYCLE_KEY]();
}

async function requestWakeLock() {
  if (!("wakeLock" in navigator)) return;
  try {
    const requestedLock = await navigator.wakeLock.request("screen");
    if (disposed) {
      requestedLock.release().catch(() => {});
      return;
    }
    wakeLock = requestedLock;
    requestedLock.addEventListener("release", () => {
      if (wakeLock === requestedLock) wakeLock = null;
    });
  } catch (e) {
    wakeLock = null;
  }
}

function releaseWakeLock() {
  if (wakeLock) {
    wakeLock.release().catch(() => {});
    wakeLock = null;
  }
}

// The OS revokes the wake lock whenever the screen actually turns off, so it
// has to be re-requested once the app is visible again — otherwise the next
// screen-off is permanent for the rest of the routine.
const handleVisibilityChange = () => {
  if (document.visibilityState === "visible" && localIntervalId && !wakeLock) {
    requestWakeLock();
  }
};
document.addEventListener("visibilitychange", handleVisibilityChange);

function stopTimer() {
  // Each Dataview execution owns only its local interval. In particular, an
  // old view's delayed MutationObserver must never clear a replacement view's
  // newly started interval through the shared state object.
  if (localIntervalId) {
    clearInterval(localIntervalId);
    if (state.intervalId === localIntervalId) state.intervalId = null;
    localIntervalId = null;
  }
  releaseWakeLock();
}

function startTimer() {
  stopTimer();
  activateCurrentSession();
  localIntervalId = setInterval(tick, REDRAW_INTERVAL_MS);
  state.intervalId = localIntervalId;
  requestWakeLock();
}

function tick() {
  updateTimerDisplay();
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
  session.elapsedBeforeStartMs += Math.max(0, now - session.startedAt);
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

function updateTimerDisplay() {
  // An action owned by a superseded Dataview execution may still be finishing
  // after a source-note edit triggered the replacement view. It may update the
  // shared state, but must never repaint its detached/retiring DOM.
  if (!isCurrentView() || state.screen !== "run" || !refs.timerEl) return;
  const task = currentTask();
  if (!task) return;
  const session = currentSession();
  const estimateMs = task.estimateMs;
  const elapsedMs = elapsedForSession(session);
  const remainingMs = estimateMs - elapsedMs;
  const overdue = remainingMs < 0;
  refs.timerEl.textContent = formatDuration(remainingMs);
  refs.timerEl.toggleClass("rr-overdue", overdue);
  const pct = Math.min(100, (elapsedMs / estimateMs) * 100);
  refs.barFillEl.style.width = pct + "%";
  refs.barFillEl.toggleClass("rr-overdue", overdue);
}

function render() {
  // Done edits the source note before it advances and saves. That edit can
  // trigger a Dataview rerun while the old action is still on the action queue.
  // Prevent the retiring execution from clearing/rebuilding UI after the new
  // generation has taken ownership of the view.
  if (!isCurrentView()) return;
  statusMenuEl?.remove();
  statusMenuEl = null;
  container.empty();
  refs = {};
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

function visibleSetupRows() {
  const query = state.taskQuery.trim().toLowerCase();
  const collapsed = new Set(state.collapsedIds);
  const rows = [];
  function visit(node, siblings, idx, depth, ancestorsEnabled) {
    const selfMatches = !query || node.display.toLowerCase().includes(query);
    const descendantMatches = node.children.some(function hasMatch(child) {
      return child.display.toLowerCase().includes(query) || child.children.some(hasMatch);
    });
    if (!selfMatches && !descendantMatches) return;
    const effectiveHere = ancestorsEnabled && node.selected;
    rows.push({ node, siblings, idx, depth, ancestorsEnabled, effectiveHere, selfMatches });
    if (query || !collapsed.has(node.id)) {
      node.children.forEach((child, childIdx) => visit(child, node.children, childIdx, depth + 1, effectiveHere));
    }
  }
  state.tasks.forEach((node, idx) => visit(node, state.tasks, idx, 0, true));
  return rows;
}

function renderTaskList() {
  const list = container.createDiv({ cls: "rr-review-list" });
  list.tabIndex = 0;
  list.setAttribute("aria-label", "Task tree; use Vim keys j/k, h/l, x, Shift-J/Shift-K, gg/G, and slash");
  const rows = visibleSetupRows();
  if (!rows.some((row) => row.node.id === state.setupCursorId)) {
    state.setupCursorId = rows[0]?.node.id ?? null;
  }
  if (rows.length === 0) {
    list.createDiv({ cls: "rr-empty", text: "No matching tasks." });
    return;
  }
  rows.forEach(({ node: t, siblings, idx, depth, ancestorsEnabled, effectiveHere: isEffective, selfMatches }) => {
    const row = list.createDiv({ cls: "rr-review-item" });
    if (!isEffective) row.addClass("rr-review-item-disabled");
    if (state.taskQuery.trim() && !selfMatches) row.addClass("rr-review-item-context");
    if (t.id === state.setupCursorId) row.addClass("rr-review-item-active");

    const text = row.createSpan({ cls: "rr-review-text" });
    text.style.paddingLeft = `${depth * 1.25}em`;
    text.createSpan({ cls: "rr-review-label", text: t.display });
    if (t.children.length) {
      const disclosure = text.createEl("button", {
        cls: "rr-disclosure",
        text: state.collapsedIds.includes(t.id) && !state.taskQuery ? "▸" : "▾",
        attr: { "aria-label": state.collapsedIds.includes(t.id) ? "Expand branch" : "Collapse branch" },
      });
      disclosure.addEventListener("click", (e) => { e.stopPropagation(); toggleCollapsed(t.id); });
    }
    text.addEventListener("click", () => {
      state.setupCursorId = t.id;
      render();
      requestAnimationFrame(() => container.querySelector(".rr-review-list")?.focus());
    });

    const badges = row.createDiv({ cls: "rr-badge-group" });
    if (t.goalCount != null) {
      badges.createSpan({ cls: "rr-badge", text: `🎯 ${t.goalCount}` });
    }
    badges.createSpan({ cls: "rr-badge", text: formatDuration(t.estimateMs) });

    const checkboxCell = row.createDiv({ cls: "rr-checkbox-cell" });
    const checkbox = checkboxCell.createEl("input", { attr: { type: "checkbox" } });
    checkbox.checked = t.selected;
    checkbox.disabled = !ancestorsEnabled;
    checkbox.addEventListener("change", () => {
      t.selected = checkbox.checked;
      render();
    });

    const reorder = row.createDiv({ cls: "rr-reorder" });
    const upBtn = reorder.createEl("button", { cls: "rr-reorder-btn", text: "↑" });
    upBtn.disabled = !ancestorsEnabled || idx === 0;
    upBtn.addEventListener("click", () => {
      [siblings[idx - 1], siblings[idx]] = [siblings[idx], siblings[idx - 1]];
      render();
    });
    const downBtn = reorder.createEl("button", { cls: "rr-reorder-btn", text: "↓" });
    downBtn.disabled = !ancestorsEnabled || idx === siblings.length - 1;
    downBtn.addEventListener("click", () => {
      [siblings[idx], siblings[idx + 1]] = [siblings[idx + 1], siblings[idx]];
      render();
    });
  });

  let pendingG = false;
  list.addEventListener("keydown", (e) => {
    if (["INPUT", "BUTTON"].includes(e.target.tagName)) return;
    const current = rows.findIndex((row) => row.node.id === state.setupCursorId);
    let nextIndex = current;
    if (e.key === "j") nextIndex = Math.min(rows.length - 1, current + 1);
    else if (e.key === "k") nextIndex = Math.max(0, current - 1);
    else if (e.key === "G") nextIndex = rows.length - 1;
    else if (e.key === "g") {
      if (pendingG) nextIndex = 0;
      pendingG = !pendingG;
      e.preventDefault();
      if (nextIndex !== current) {
        state.setupCursorId = rows[nextIndex].node.id;
        render();
        requestAnimationFrame(() => container.querySelector(".rr-review-list")?.focus());
      }
      return;
    } else if (e.key === "/") {
      e.preventDefault();
      container.querySelector(".rr-task-search")?.focus();
      return;
    } else if ([" ", "x"].includes(e.key)) {
      const item = rows[current];
      if (item?.ancestorsEnabled) item.node.selected = !item.node.selected;
    } else if (e.key === "h") {
      const item = rows[current];
      if (item?.node.children.length && !state.collapsedIds.includes(item.node.id)) state.collapsedIds.push(item.node.id);
    } else if (e.key === "l") {
      state.collapsedIds = state.collapsedIds.filter((id) => id !== rows[current]?.node.id);
    } else if (e.key === "K" || e.key === "J") {
      const item = rows[current];
      if (item?.ancestorsEnabled) {
        const delta = e.key === "K" ? -1 : 1;
        const target = item.idx + delta;
        if (target >= 0 && target < item.siblings.length) {
          [item.siblings[item.idx], item.siblings[target]] = [item.siblings[target], item.siblings[item.idx]];
        }
      }
    } else return;
    pendingG = false;
    e.preventDefault();
    if (nextIndex !== current && rows[nextIndex]) state.setupCursorId = rows[nextIndex].node.id;
    render();
    requestAnimationFrame(() => container.querySelector(".rr-review-list")?.focus());
  });
}

function toggleCollapsed(id) {
  state.collapsedIds = state.collapsedIds.includes(id)
    ? state.collapsedIds.filter((item) => item !== id)
    : [...state.collapsedIds, id];
  render();
}

function renderSetupTools() {
  const tools = container.createDiv({ cls: "rr-setup-tools" });
  const top = tools.createDiv({ cls: "rr-tools-row" });
  const search = top.createEl("input", {
    cls: "rr-input rr-task-search",
    attr: { type: "search", placeholder: "Search tasks…  (Vim: /)" },
  });
  search.value = state.taskQuery;
  search.addEventListener("input", () => {
    state.taskQuery = search.value;
    render();
    requestAnimationFrame(() => {
      const next = container.querySelector(".rr-task-search");
      if (next) { next.focus(); next.setSelectionRange(next.value.length, next.value.length); }
    });
  });
  const leaves = enabledLeaves(state.tasks);
  const estimate = leaves.reduce((sum, leaf) => sum + leaf.estimateMs, 0);
  top.createSpan({ cls: "rr-summary", text: `${leaves.length} leaf task${leaves.length === 1 ? "" : "s"} · ${formatDuration(estimate)}` });

  const actions = tools.createDiv({ cls: "rr-tools-row" });
  const matchingNodes = () => visibleSetupRows().filter((row) => row.selfMatches).map((row) => row.node);
  const selectionNodes = () => state.taskQuery.trim() ? matchingNodes() : state.tasks;
  const structureNodes = () => state.taskQuery.trim() ? matchingNodes() : flatten(state.tasks);
  const selectBtn = actions.createEl("button", { cls: "rr-tool-btn", text: "Enable" });
  selectBtn.addEventListener("click", () => { selectionNodes().forEach((node) => { node.selected = true; }); render(); });
  const clearBtn = actions.createEl("button", { cls: "rr-tool-btn", text: "Disable" });
  clearBtn.addEventListener("click", () => { selectionNodes().forEach((node) => { node.selected = false; }); render(); });
  const expandBtn = actions.createEl("button", { cls: "rr-tool-btn", text: "Expand" });
  expandBtn.addEventListener("click", () => {
    const ids = new Set(structureNodes().map((node) => node.id));
    state.collapsedIds = state.collapsedIds.filter((id) => !ids.has(id));
    render();
  });
  const collapseBtn = actions.createEl("button", { cls: "rr-tool-btn", text: "Collapse" });
  collapseBtn.addEventListener("click", () => {
    state.collapsedIds = [...new Set([
      ...state.collapsedIds,
      ...structureNodes().filter((node) => node.children.length).map((node) => node.id),
    ])];
    render();
  });
  const resetBtn = actions.createEl("button", { cls: "rr-tool-btn rr-reset-btn", text: "Reset" });
  resetBtn.addEventListener("click", () => {
    state.taskQuery = "";
    state.collapsedIds = [];
    state.setupCursorId = null;
    recomputeTasksForSection();
    render();
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

  renderSetupTools();
  renderTaskList();

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
    startTimer();
    render();
    await queueSave();
  }));
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

  const header = container.createDiv({ cls: "rr-header" });
  const runLabel = currentSectionLabel();
  header.createDiv({
    cls: "rr-progress-label",
    text: `Leaf ${state.processedLeafCount + 1} of ${state.totalLeafCount} — ${state.file.basename}${runLabel ? " › " + runLabel : ""}`,
  });
  const stopBtn = header.createEl("button", { cls: "rr-btn-stop", text: "Stop" });
  stopBtn.addEventListener("click", () => enqueueAction(stopRoutine));

  const card = container.createDiv({ cls: "rr-card" });
  const crumbs = card.createDiv({ cls: "rr-task-text" });
  const path = taskPath(map.get(state.activeLeafId), map);
  RRE.renderBreadcrumbs(crumbs, path, task.line, (line, part) => enqueueAction(() => focusTask(part.id)), false);
  card.createDiv({ cls: "rr-est", text: `Estimated: ${formatDuration(task.estimateMs)}` });

  if (task.goalCount != null) {
    const countRow = card.createDiv({ cls: "rr-count-row" });
    const minusBtn = countRow.createEl("button", { cls: "rr-btn rr-count-btn", text: "−" });
    let valueEl = countRow.createSpan({ cls: "rr-count-value", text: String(session.count) });
    countRow.createSpan({ cls: "rr-count-sep", text: "/" });
    countRow.createSpan({ cls: "rr-count-goal", text: String(task.goalCount) });
    const plusBtn = countRow.createEl("button", { cls: "rr-btn rr-count-btn", text: "+" });

    function setCount(n) {
      session.count = Math.max(0, n);
      valueEl.textContent = String(session.count);
      scheduleCountSave();
    }

    function startEdit() {
      const input = document.createElement("input");
      input.type = "number";
      input.className = "rr-count-input";
      input.value = String(session.count);
      valueEl.replaceWith(input);
      input.focus();
      input.select();
      const commit = () => {
        const n = parseInt(input.value, 10);
        enqueueAction(() => setCount(isNaN(n) ? session.count : n));
        input.replaceWith(valueEl);
      };
      input.addEventListener("blur", commit);
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") input.blur();
        if (e.key === "Escape") { input.value = String(session.count); input.blur(); }
      });
    }

    minusBtn.addEventListener("click", () => enqueueAction(() => setCount(session.count - 1)));
    plusBtn.addEventListener("click", () => enqueueAction(() => setCount(session.count + 1)));
    valueEl.addEventListener("click", startEdit);
  }

  const timerRow = card.createDiv({ cls: "rr-timer-row" });
  refs.timerEl = timerRow.createDiv({ cls: "rr-timer", text: "0:00" });

  const bar = card.createDiv({ cls: "rr-bar" });
  refs.barFillEl = bar.createDiv({ cls: "rr-bar-fill" });

  const btnRow = card.createDiv({ cls: "rr-btn-row" });
  const pauseBtn = btnRow.createEl("button", { cls: "rr-btn", text: session.startedAt === null ? "Resume" : "Pause" });
  pauseBtn.addEventListener("click", () => enqueueAction(async () => {
    const now = Date.now();
    if (session.startedAt === null) {
      session.startedAt = now;
    } else {
      settleSession(session, now);
    }
    pauseBtn.textContent = session.startedAt === null ? "Resume" : "Pause";
    updateTimerDisplay();
    await queueSave();
  }));
  const skipBtn = btnRow.createEl("button", { cls: "rr-btn", text: "Skip" });
  skipBtn.addEventListener("click", () => enqueueAction(() => advance(false)));
  const doneBtn = btnRow.createEl("button", { cls: "rr-btn rr-btn-primary", text: "Done" });
  doneBtn.addEventListener("click", () => enqueueAction(() => completeCurrentTask()));
  doneBtn.setAttribute("title", "Right-click to choose a Tasks status");
  doneBtn.addEventListener("contextmenu", async (e) => {
    e.preventDefault();
    await showStatusMenu(doneBtn);
  });

  const retired = new Set(state.retiredIds);
  flatten([task]).forEach((node) => retired.add(node.id));
  const next = leaves.slice(activeIndex + 1).find((leaf) => !retired.has(leaf.id));
  container.createDiv({
    cls: "rr-next",
    text: next ? `Next: ${pathLabel(next, map)} (${formatDuration(next.estimateMs)})` : "This is the last remaining leaf task.",
  });

  updateTimerDisplay();
}

function renderDone() {
  stopTimer();
  container.createDiv({ cls: "rr-header" }).createEl("h3", { text: "Routine complete 🎉" });
  container.createDiv({ text: `${state.processedLeafCount} of ${state.totalLeafCount} leaf tasks processed; ${state.completedCount} Done action${state.completedCount === 1 ? "" : "s"}.` });
  const again = container.createEl("button", { cls: "rr-btn rr-btn-primary", text: "Run another note" });
  again.addEventListener("click", () => {
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

async function configuredTaskStatuses() {
  const defaults = [
    { symbol: " ", name: "Todo", type: "TODO" },
    { symbol: "x", name: "Done", type: "DONE" },
  ];
  const fallbackCustom = [
    { symbol: "/", name: "In Progress", type: "IN_PROGRESS" },
    { symbol: "-", name: "Cancelled", type: "CANCELLED" },
  ];
  const plugin = app.plugins.plugins["obsidian-tasks-plugin"];
  let settings;
  try {
    settings = await plugin?.loadData?.();
  } catch (e) {
    settings = null;
  }
  const configured = settings?.statusSettings;
  const statuses = [
    ...(configured?.coreStatuses ?? defaults),
    ...(configured?.customStatuses ?? fallbackCustom),
  ];
  const seen = new Set();
  return statuses.filter((status) => {
    if (typeof status?.symbol !== "string" || status.symbol.length !== 1 || seen.has(status.symbol)) return false;
    seen.add(status.symbol);
    return true;
  });
}

async function showStatusMenu(anchor) {
  statusMenuEl?.remove();
  const statuses = await configuredTaskStatuses();
  if (state.screen !== "run" || !document.body.contains(anchor)) return;
  const menu = document.body.createDiv({ cls: "rr-status-menu" });
  statusMenuEl = menu;
  menu.tabIndex = -1;
  statuses.forEach((status) => {
    const option = menu.createEl("button", { cls: "rr-status-option" });
    option.createSpan({ cls: "rr-status-symbol", text: `[${status.symbol}]` });
    option.createSpan({ text: status.name || "Unnamed" });
    if (status.type) option.createSpan({ cls: "rr-status-type", text: status.type.replaceAll("_", " ") });
    option.addEventListener("click", () => {
      menu.remove();
      statusMenuEl = null;
      enqueueAction(() => completeCurrentTask(status.symbol === "x" ? null : status));
    });
  });
  const rect = anchor.getBoundingClientRect();
  const menuRect = menu.getBoundingClientRect();
  const left = Math.max(4, Math.min(rect.right - menuRect.width, window.innerWidth - menuRect.width - 4));
  const top = rect.top >= menuRect.height + 6
    ? rect.top - menuRect.height - 6
    : Math.min(rect.bottom + 6, window.innerHeight - menuRect.height - 4);
  menu.style.left = `${left}px`;
  menu.style.top = `${Math.max(4, top)}px`;
  menu.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      menu.remove();
      statusMenuEl = null;
      anchor.focus();
    }
  });
  menu.addEventListener("focusout", () => setTimeout(() => {
    if (!menu.contains(document.activeElement)) {
      menu.remove();
      if (statusMenuEl === menu) statusMenuEl = null;
    }
  }, 0));
  menu.focus();
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

  const tasksApi = app.plugins.plugins["obsidian-tasks-plugin"]?.apiV1;
  const terminalTypes = new Set(["DONE", "CANCELLED", "NON_TASK"]);
  const useTasksCompletion = selectedStatus === null || terminalTypes.has(selectedStatus.type);
  let replacement;
  if (useTasksCompletion && tasksApi && typeof tasksApi.executeToggleTaskDoneCommand === "function") {
    replacement = tasksApi.executeToggleTaskDoneCommand(rawLine, state.file.path);
  } else if (selectedStatus !== null) {
    replacement = rawLine.replace(TASK_LINE_RE, (m, p1, p2, p3, p4) => `${p1}${selectedStatus.symbol}${p3}${p4}`);
  } else {
    replacement = rawLine.replace(TASK_LINE_RE, (m, p1, p2, p3, p4) => `${p1}x${p3}${p4}`);
  }

  if (selectedStatus !== null && useTasksCompletion) {
    let pluginSettings = null;
    try {
      pluginSettings = await app.plugins.plugins["obsidian-tasks-plugin"]?.loadData?.();
    } catch (e) {}
    const date = window.moment().format("YYYY-MM-DD");
    replacement = replacement.split("\n").map((line) => {
      const match = line.match(TASK_LINE_RE);
      if (!match || match[2] === " ") return line;
      let changed = line.replace(TASK_LINE_RE, (m, p1, p2, p3, p4) => `${p1}${selectedStatus.symbol}${p3}${p4}`);
      changed = changed.replace(/\s+[✅❌]\s*\d{4}-\d{2}-\d{2}/gu, "").replace(/\s+$/, "");
      if (selectedStatus.type === "DONE" && pluginSettings?.setDoneDate !== false) changed += ` ✅ ${date}`;
      if (selectedStatus.type === "CANCELLED" && pluginSettings?.setCancelledDate !== false) changed += ` ❌ ${date}`;
      return changed;
    }).join("\n");
  }

  const elapsedLabel = formatDuration(elapsedForSession(session));
  const resultText = task.goalCount != null ? `🏁 ${elapsedLabel} 🥅 ${session.count}` : `🏁 ${elapsedLabel}`;
  const replacementLines = replacement.split("\n").map((line) => {
    const lm = line.match(TASK_LINE_RE);
    if (lm && lm[2] !== " ") {
      return insertBeforeTasksMetadata(line, resultText);
    }
    return line;
  });
  lines.splice(task.line, 1, ...replacementLines);
  await app.vault.modify(state.file, lines.join("\n"));

  const shift = replacementLines.length - 1;
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
      if (state.screen === "run") {
        localIntervalId = setInterval(tick, REDRAW_INTERVAL_MS);
        state.intervalId = localIntervalId;
        requestWakeLock();
      }
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
      if (state.screen === "run") {
        localIntervalId = setInterval(tick, REDRAW_INTERVAL_MS);
        state.intervalId = localIntervalId;
        requestWakeLock();
      }
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
    if (state.screen === "run") {
      localIntervalId = setInterval(tick, REDRAW_INTERVAL_MS);
      state.intervalId = localIntervalId;
      requestWakeLock();
    }
  }
}

await initializeFromCache();

let containerAttached = document.body.contains(container);

function syncViewAttachment() {
  const isAttached = document.body.contains(container);
  if (isAttached === containerAttached) return;
  containerAttached = isAttached;
  if (!isAttached) {
    statusMenuEl?.remove();
    statusMenuEl = null;
    // Keep timestamp-based session time running, but suspend work that only
    // serves this view while Obsidian has its DOM detached.
    stopTimer();
    return;
  }
  disposed = false;
  if (state.screen === "run" && !localIntervalId) {
    tick();
    localIntervalId = setInterval(tick, REDRAW_INTERVAL_MS);
    state.intervalId = localIntervalId;
    requestWakeLock();
  }
}

const watchdog = new MutationObserver(syncViewAttachment);
watchdog.observe(document.body, { childList: true, subtree: true });

const cleanupView = () => {
  disposed = true;
  watchdog.disconnect();
  document.removeEventListener("visibilitychange", handleVisibilityChange);
  statusMenuEl?.remove();
  statusMenuEl = null;
  stopTimer();
  if (window[VIEW_LIFECYCLE_KEY] === cleanupView) delete window[VIEW_LIFECYCLE_KEY];
};
window[VIEW_LIFECYCLE_KEY] = cleanupView;
})(globalThis.__routineRunnerEntry);

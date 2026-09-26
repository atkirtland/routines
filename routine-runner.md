---
aliases:
  - Routine Runner
created: 2026-09-19T15:14:37-04:00
modified: 2026-09-25T00:00:00-04:00
---

# Routine Runner

<details>
<summary>How it works</summary>
<p>Pick a note, then step through its enabled open leaf tasks, depth-first, with a countdown timer.</p>
<ul>
<li>Add a time goal to a task with <code>⏱️ mm:ss</code> or <code>⏱️ hh:mm:ss</code>, e.g. <code>- [ ] Stretch ⏱️ 10:00</code>. No marker → defaults to 5:00.</li>
<li>Give a task a count goal instead with <code>🎯 n</code>, e.g. <code>- [ ] Push-ups 🎯 20</code>. While it's running, tap the − / + buttons or click the number to log how many you actually did; the current count and the goal are shown side by side.</li>
<li>If a task also has <code>#tags</code> or Tasks plugin metadata (dates, priority, recurrence, …), put the routine runner marker after the tags and before the metadata: <code>- [ ] Push-ups #fitness 🎯 20 📅 2026-09-25</code>.</li>
<li>Type into the note field to search and pick a note — the field stays a live search box, so you can click back into it anytime afterward to switch to a different note. If the note has headings, a section field appears the same way, letting you scope the routine to just the tasks under one heading (a section runs until the next heading of the same or higher level, or end of file); leave it on "Whole note" to run everything.</li>
<li>Indented checkbox tasks form a tree. Before starting, uncheck any task you want to leave out; disabling a parent temporarily disables its descendants without forgetting their choices. The ↑ / ↓ buttons reorder siblings only, and moving a parent carries its whole subtree for this run without editing the note.</li>
<li>For long routines, use the sticky setup toolbar to search tasks and enable, disable, collapse, or expand direct matches; dimmed ancestor rows are context only. With a blank search, Enable/Disable affects the top-level gates (preserving descendant choices), while Expand/Collapse applies to the whole tree. Reset restores the current note and section's original task order, selections, search, and expansion state.</li>
<li>The setup tree supports Vim-style keys: <code>j</code>/<code>k</code> move, <code>h</code>/<code>l</code> collapse/expand, <code>Space</code> or <code>x</code> toggles, <code>Shift-K</code>/<code>Shift-J</code> reorders among siblings, <code>g g</code>/<code>G</code> jumps to the first/last row, and <code>/</code> focuses search.</li>
<li>The ordinary run visits enabled structural leaves in depth-first order. Task and “Next” labels show the complete path. Click any breadcrumb to move between the leaf and its ancestors; each task keeps its own independent timer/count state.</li>
<li><strong>Done</strong> hooks into the Tasks plugin's own completion command (respects custom done symbols / recurrence) if the plugin is installed; otherwise it falls back to a plain <code>[ ]</code> → <code>[x]</code> toggle. It also records <code>🏁 mm:ss</code> (or <code>🏁 hh:mm:ss</code> past an hour) — and for a task with a count goal, <code>🥅 n</code> alongside it — the actual time (and count) achieved. These are inserted right before any Tasks plugin metadata (dates, priority, recurrence, done date, …), so the order stays description → tags → routine runner markers → Tasks plugin metadata.</li>
<li>Right-click <strong>Done</strong> to choose any status configured in the Tasks plugin, such as <code>[-]</code> for Cancelled. Terminal statuses use Tasks' completion processing for recurrence and on-completion behavior, then receive the appropriate done or cancelled date; non-terminal statuses are applied directly.</li>
<li><strong>Skip</strong> advances without touching the file.</li>
<li>Using <strong>Done</strong> or <strong>Skip</strong> while focused on an ancestor retires that ancestor's remaining branch for this run and advances to the first leaf after it. Done edits only the focused ancestor; it does not check descendants.</li>
<li>The <strong>Leave tasks unchecked</strong> toggle (off by default) makes <strong>Done</strong> behave like Skip — it advances and still counts toward the completed total, but never edits the file. Use it for lists where you don't want completion status recorded.</li>
<li>Timer keeps counting past the estimate into negative time, shown in red.</li>
<li>While a routine is running it requests a screen wake lock (where supported) so the display doesn't auto-lock. This only keeps the screen on — it can't keep the timer running if you switch apps or lock the screen manually, since that needs OS-level background permission a markdown code block doesn't have.</li>
<li>Progress is kept outside this code block, so Dataview's periodic auto-refresh (it re-runs every <code>dataviewjs</code> block whenever any file in the vault changes) won't bump you back to the picker mid-routine. It stays in place until you finish, click Stop, or restart Obsidian.</li>
</ul>
</details>

```dataviewjs
const DEFAULT_ESTIMATE_MS = 5 * 60 * 1000;
const TIME_GOAL_RE = /⏱️?\s*(\d+):(\d{2})(?::(\d{2}))?/;
const COUNT_GOAL_RE = /🎯\s*(\d+)/;
const TASK_LINE_RE = /^(\s*[-*+]\s\[)([^\]])(\]\s?)(.*)$/;

function parseEstimateMs(text) {
  const m = text.match(TIME_GOAL_RE);
  if (!m) return DEFAULT_ESTIMATE_MS;
  if (m[3] !== undefined) {
    const h = parseInt(m[1], 10), mnt = parseInt(m[2], 10), sec = parseInt(m[3], 10);
    return ((h * 60 + mnt) * 60 + sec) * 1000;
  }
  const mnt = parseInt(m[1], 10), sec = parseInt(m[2], 10);
  return (mnt * 60 + sec) * 1000;
}

function parseGoalCount(text) {
  const m = text.match(COUNT_GOAL_RE);
  return m ? parseInt(m[1], 10) : null;
}

// Tasks plugin's own metadata (dates, priority, recurrence, done date, id, on-hold)
// is always emoji-prefixed and belongs at the very end of the line. Our own result
// markers should sit before it — after the description and any #tags — so insert
// just ahead of whichever of these shows up first, rather than appending blindly.
const TASKS_METADATA_EMOJI_RE = /[🔺⏫🔼🔽⏬🔁➕🛫⏳📅✅❌🆔⛔]/;

function insertBeforeTasksMetadata(line, insertText) {
  const trimmed = line.replace(/\s+$/, "");
  const m = trimmed.match(TASKS_METADATA_EMOJI_RE);
  if (!m) return `${trimmed} ${insertText}`;
  const before = trimmed.slice(0, m.index).replace(/\s+$/, "");
  const after = trimmed.slice(m.index);
  return `${before} ${insertText} ${after}`;
}

function formatDuration(ms) {
  const neg = ms < 0;
  let totalSec = Math.round(Math.abs(ms) / 1000);
  const h = Math.floor(totalSec / 3600);
  totalSec -= h * 3600;
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  const ss = String(s).padStart(2, "0");
  const str = h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
  return (neg ? "-" : "") + str;
}

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
    .rr-input { width:100%; box-sizing:border-box; padding:6px 10px; border-radius:6px; border:1px solid var(--background-modifier-border); background:var(--background-primary); color:var(--text-normal); margin-bottom:0.5em; }
    .rr-toggle-row { display:flex; align-items:center; gap:0.5em; margin-bottom:0.75em; color:var(--text-muted); font-size:0.9em; }
    .rr-toggle-row label { cursor:pointer; }
    .rr-pick-list { max-height:300px; overflow-y:auto; border:1px solid var(--background-modifier-border); border-radius:6px; margin-bottom:0.75em; }
    .rr-pick-item { display:flex; justify-content:space-between; gap:1em; padding:6px 10px; cursor:pointer; }
    .rr-pick-item:hover { background:var(--background-modifier-hover); }
    .rr-pick-item-active { background:var(--background-modifier-hover); font-weight:600; }
    .rr-section-list { max-height:180px; }
    .rr-pick-path { color:var(--text-faint); font-size:0.8em; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .rr-empty { color:var(--text-muted); padding:8px 0; }
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

const HEADING_RE = /^(#{1,6})\s+(.+?)\s*$/;

// Dataview tears down and re-runs this whole block on a debounced timer whenever
// any file in the vault changes (e.g. when we ourselves edit the routine note on
// Done) — it has no way to know this block doesn't care. A fresh `state` object
// on every run would silently dump the user back to the picker mid-routine, so
// state lives on `window` and survives across those re-executions.
const RR_STATE_KEY = "__routineRunnerState";
const STATE_VERSION = 3;

const defaultState = {
  version: STATE_VERSION,
  screen: "setup",
  noteQuery: "",
  file: null,
  tasks: [],
  runTasks: [],
  index: 0,
  lastTick: 0,
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

async function loadFileData(file) {
  const content = await app.vault.read(file);
  const lines = content.split("\n");
  const headings = [];
  const allNodes = [];
  const stack = [];
  let nextId = 0;
  lines.forEach((line, i) => {
    const hm = line.match(HEADING_RE);
    if (hm) headings.push({ line: i, level: hm[1].length, text: hm[2] });
    const tm = line.match(TASK_LINE_RE);
    if (tm) {
      const desc = tm[4];
      const display = desc.replace(TIME_GOAL_RE, "").replace(COUNT_GOAL_RE, "").replace(/\s{2,}/g, " ").trim();
      const prefix = tm[1].slice(0, tm[1].search(/[-*+]/));
      let indent = 0;
      for (const ch of prefix) indent += ch === "\t" ? 4 : 1;
      while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop();
      const parent = stack.length ? stack[stack.length - 1] : null;
      const node = {
        id: `task-${nextId++}`,
        line: i,
        sourceLine: line,
        indent,
        parentId: parent?.id ?? null,
        children: [],
        checked: tm[2] !== " ",
        selected: true,
        display,
        displayPath: [...(parent?.displayPath ?? []), display],
        estimateMs: parseEstimateMs(desc),
        goalCount: parseGoalCount(desc),
      };
      if (parent) parent.children.push(node);
      allNodes.push(node);
      stack.push(node);
    }
  });
  return { totalLines: lines.length, headings, tasks: allNodes };
}

// A section runs from just after its heading to the next heading of the
// same or higher level (fewer #'s), or end of file.
function sectionLineRange(headings, totalLines, idx) {
  const h = headings[idx];
  let end = totalLines;
  for (let j = idx + 1; j < headings.length; j++) {
    if (headings[j].level <= h.level) {
      end = headings[j].line;
      break;
    }
  }
  return { start: h.line + 1, end };
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
  query = query.toLowerCase();
  text = text.toLowerCase();
  let qi = 0, score = 0, streak = 0;
  for (let ti = 0; ti < text.length && qi < query.length; ti++) {
    if (text[ti] === query[qi]) {
      qi++;
      streak++;
      score += 1 + streak * 0.5;
    } else {
      streak = 0;
    }
  }
  return qi === query.length ? score : -1;
}

let wakeLock = null;
let localIntervalId = null;
let disposed = false;

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
  state.lastTick = Date.now();
  localIntervalId = setInterval(tick, 250);
  state.intervalId = localIntervalId;
  requestWakeLock();
}

function tick() {
  const now = Date.now();
  const session = currentSession();
  if (session && !session.paused) session.elapsedMs += now - state.lastTick;
  state.lastTick = now;
  updateTimerDisplay();
}

function flatten(nodes) {
  const result = [];
  const visit = (node) => { result.push(node); node.children.forEach(visit); };
  nodes.forEach(visit);
  return result;
}

function nodeMap(nodes = state.runTasks) {
  return new Map(flatten(nodes).map((node) => [node.id, node]));
}

function effective(node, map) {
  for (let cur = node; cur; cur = cur.parentId ? map.get(cur.parentId) : null) {
    if (!cur.selected) return false;
  }
  return true;
}

function enabledLeaves(nodes) {
  const map = nodeMap(nodes);
  return flatten(nodes).filter((node) => node.children.length === 0 && effective(node, map));
}

function currentTask() {
  return nodeMap().get(state.focusId) || null;
}

function currentSession() {
  if (!state.focusId) return null;
  return state.sessions[state.focusId] || (state.sessions[state.focusId] = { elapsedMs: 0, count: 0, paused: false });
}

function taskPath(node, map = nodeMap()) {
  const path = [];
  for (let cur = node; cur; cur = cur.parentId ? map.get(cur.parentId) : null) path.unshift(cur);
  return path;
}

function pathLabel(node, map = nodeMap()) {
  return taskPath(node, map).map((part) => part.display).join(" → ");
}

function updateTimerDisplay() {
  if (state.screen !== "run" || !refs.timerEl) return;
  const task = currentTask();
  if (!task) return;
  const session = currentSession();
  const estimateMs = task.estimateMs;
  const remainingMs = estimateMs - session.elapsedMs;
  const overdue = remainingMs < 0;
  refs.timerEl.textContent = formatDuration(remainingMs);
  refs.timerEl.toggleClass("rr-overdue", overdue);
  const pct = Math.min(100, (session.elapsedMs / estimateMs) * 100);
  refs.barFillEl.style.width = pct + "%";
  refs.barFillEl.toggleClass("rr-overdue", overdue);
}

function render() {
  statusMenuEl?.remove();
  statusMenuEl = null;
  container.empty();
  refs = {};
  if (state.screen === "run") renderRun();
  else if (state.screen === "done") renderDone();
  else renderSetup();
}

function renderNoteCombo() {
  const input = container.createEl("input", {
    cls: "rr-input",
    attr: { type: "text", placeholder: "Type a note name…" },
  });
  input.value = state.file ? state.file.basename : state.noteQuery;
  const list = container.createDiv({ cls: "rr-pick-list" });
  list.style.display = "none";

  function renderList(query) {
    list.empty();
    const files = app.vault.getMarkdownFiles();
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
      item.createSpan({ text: (o.level ? "  ".repeat(o.level - 1) : "") + o.text });
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
  startBtn.addEventListener("click", () => {
    state.runTasks = state.tasks;
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
    render();
    startTimer();
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
  stopTimer();
  if (state.file) {
    const data = await loadFileData(state.file);
    state.headings = data.headings;
    state.totalLines = data.totalLines;
    state.allTasks = data.tasks;
    recomputeTasksForSection();
  }
  state.runTasks = [];
  state.screen = "setup";
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
  stopBtn.addEventListener("click", () => stopRoutine());

  const card = container.createDiv({ cls: "rr-card" });
  const crumbs = card.createDiv({ cls: "rr-task-text" });
  const path = taskPath(map.get(state.activeLeafId), map);
  path.forEach((part, idx) => {
    if (idx) crumbs.createSpan({ cls: "rr-crumb-sep", text: "→" });
    const crumb = crumbs.createSpan({
      cls: part.id === task.id ? "rr-crumb rr-crumb-current" : "rr-crumb",
      text: part.display,
    });
    if (part.id !== task.id) crumb.addEventListener("click", () => focusTask(part.id));
  });
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
        setCount(isNaN(n) ? session.count : n);
        input.replaceWith(valueEl);
      };
      input.addEventListener("blur", commit);
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") input.blur();
        if (e.key === "Escape") { input.value = String(session.count); input.blur(); }
      });
    }

    minusBtn.addEventListener("click", () => setCount(session.count - 1));
    plusBtn.addEventListener("click", () => setCount(session.count + 1));
    valueEl.addEventListener("click", startEdit);
  }

  const timerRow = card.createDiv({ cls: "rr-timer-row" });
  refs.timerEl = timerRow.createDiv({ cls: "rr-timer", text: "0:00" });

  const bar = card.createDiv({ cls: "rr-bar" });
  refs.barFillEl = bar.createDiv({ cls: "rr-bar-fill" });

  const btnRow = card.createDiv({ cls: "rr-btn-row" });
  const pauseBtn = btnRow.createEl("button", { cls: "rr-btn", text: session.paused ? "Resume" : "Pause" });
  pauseBtn.addEventListener("click", () => {
    session.paused = !session.paused;
    state.lastTick = Date.now();
    pauseBtn.textContent = session.paused ? "Resume" : "Pause";
  });
  const skipBtn = btnRow.createEl("button", { cls: "rr-btn", text: "Skip" });
  skipBtn.addEventListener("click", () => advance(false));
  const doneBtn = btnRow.createEl("button", { cls: "rr-btn rr-btn-primary", text: "Done" });
  doneBtn.addEventListener("click", () => completeCurrentTask());
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

function focusTask(id) {
  state.focusId = id;
  state.lastTick = Date.now();
  render();
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
      completeCurrentTask(status.symbol === "x" ? null : status);
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

function advance(wasDone) {
  if (wasDone) state.completedCount++;
  const focused = currentTask();
  const retired = new Set(state.retiredIds);
  const branchIds = new Set(flatten([focused]).map((node) => node.id));
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
  } else {
    state.screen = "done";
  }
  render();
}

// Terminal status choices first use Tasks' completion transformation so recurrence
// and on-completion behavior are preserved. The completed occurrence is then
// converted to the chosen symbol and its date marker is normalized for that type.
async function completeCurrentTask(selectedStatus = null) {
  if (state.leaveUnchecked) {
    advance(true);
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

  const elapsedLabel = formatDuration(session.elapsedMs);
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

  advance(true);
}

render();
// Rehydrated mid-routine from a prior execution: resume ticking in this
// context. The previous context's interval was retired during initialization,
// and each watchdog below can stop only the interval its own context created.
if (state.screen === "run") startTimer();

const watchdog = new MutationObserver(() => {
  if (!document.body.contains(container)) {
    disposed = true;
    statusMenuEl?.remove();
    statusMenuEl = null;
    stopTimer();
    document.removeEventListener("visibilitychange", handleVisibilityChange);
    watchdog.disconnect();
  }
});
watchdog.observe(document.body, { childList: true, subtree: true });
```

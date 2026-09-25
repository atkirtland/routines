---
aliases:
  - Routine Runner
created: 2026-09-19T15:14:37-04:00
modified: 2026-09-25T00:00:00-04:00
---

# Routine Runner

<details>
<summary>How it works</summary>
<p>Pick a note, then step through its open tasks one at a time with a countdown timer.</p>
<ul>
<li>Add a time goal to a task with <code>⏱️ mm:ss</code> or <code>⏱️ hh:mm:ss</code>, e.g. <code>- [ ] Stretch ⏱️ 10:00</code>. No marker → defaults to 5:00.</li>
<li>Give a task a count goal instead with <code>🎯 n</code>, e.g. <code>- [ ] Push-ups 🎯 20</code>. While it's running, tap the − / + buttons or click the number to log how many you actually did; the current count and the goal are shown side by side.</li>
<li>If a task also has <code>#tags</code> or Tasks plugin metadata (dates, priority, recurrence, …), put the routine runner marker after the tags and before the metadata: <code>- [ ] Push-ups #fitness 🎯 20 📅 2026-09-25</code>.</li>
<li>Type into the note field to search and pick a note — the field stays a live search box, so you can click back into it anytime afterward to switch to a different note. If the note has headings, a section field appears the same way, letting you scope the routine to just the tasks under one heading (a section runs until the next heading of the same or higher level, or end of file); leave it on "Whole note" to run everything.</li>
<li>Before starting, uncheck any task you want to leave out of the run, and use the ↑ / ↓ buttons to put the remaining tasks in whatever order you want to do them.</li>
<li><strong>Done</strong> hooks into the Tasks plugin's own completion command (respects custom done symbols / recurrence) if the plugin is installed; otherwise it falls back to a plain <code>[ ]</code> → <code>[x]</code> toggle. It also records <code>🏁 mm:ss</code> (or <code>🏁 hh:mm:ss</code> past an hour) — and for a task with a count goal, <code>🥅 n</code> alongside it — the actual time (and count) achieved. These are inserted right before any Tasks plugin metadata (dates, priority, recurrence, done date, …), so the order stays description → tags → routine runner markers → Tasks plugin metadata.</li>
<li><strong>Skip</strong> advances without touching the file.</li>
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

if (!document.getElementById("routine-runner-style")) {
  const style = document.createElement("style");
  style.id = "routine-runner-style";
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
    .rr-review-list { display:grid; grid-template-columns:minmax(0,1fr) auto auto auto; align-items:center; column-gap:0.6em; padding:0 10px; border:1px solid var(--background-modifier-border); border-radius:6px; margin-bottom:0.75em; }
    .rr-review-item { display:contents; }
    .rr-review-item > * { padding:6px 0; border-bottom:1px solid var(--background-modifier-border); box-sizing:border-box; }
    .rr-review-list > .rr-review-item:last-child > * { border-bottom:none; }
    .rr-review-item-disabled > * { opacity:0.45; }
    .rr-review-item-disabled .rr-review-text { text-decoration:line-through; }
    .rr-review-text { min-width:0; }
    .rr-badge { color:var(--text-muted); font-size:0.8em; background:var(--background-secondary); border-radius:4px; padding:1px 6px; white-space:nowrap; }
    .rr-badge-group { display:flex; align-items:center; justify-content:flex-end; gap:0.4em; }
    .rr-checkbox-cell { display:flex; align-items:center; justify-content:center; }
    .rr-reorder { display:flex; flex-direction:column; justify-content:center; gap:2px; }
    .rr-reorder-btn { line-height:1; font-size:0.7em; padding:2px 6px; border-radius:4px; border:1px solid var(--background-modifier-border); background:var(--interactive-normal); color:var(--text-normal); cursor:pointer; }
    .rr-reorder-btn:hover:not(:disabled) { background:var(--interactive-hover); }
    .rr-reorder-btn:disabled { opacity:0.3; cursor:default; }
    .rr-card { border:1px solid var(--background-modifier-border); border-radius:8px; padding:1em; background:var(--background-secondary); }
    .rr-task-text { font-size:1.15em; font-weight:600; margin-bottom:0.25em; }
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
    .rr-btn-stop { flex:none; padding:4px 14px; font-size:0.85em; border-radius:6px; border:1px solid var(--background-modifier-border); background:var(--interactive-normal); color:var(--text-normal); cursor:pointer; }
    .rr-btn-stop:hover { background:var(--interactive-hover); }
    .rr-next { margin-top:0.75em; color:var(--text-muted); font-size:0.9em; }
    .rr-progress-label { font-weight:600; }
  `;
  document.head.appendChild(style);
}

const HEADING_RE = /^(#{1,6})\s+(.+?)\s*$/;

// Dataview tears down and re-runs this whole block on a debounced timer whenever
// any file in the vault changes (e.g. when we ourselves edit the routine note on
// Done) — it has no way to know this block doesn't care. A fresh `state` object
// on every run would silently dump the user back to the picker mid-routine, so
// state lives on `window` and survives across those re-executions.
const RR_STATE_KEY = "__routineRunnerState";

const defaultState = {
  screen: "setup",
  noteQuery: "",
  file: null,
  tasks: [],
  runTasks: [],
  index: 0,
  paused: false,
  elapsedMs: 0,
  count: 0,
  lastTick: 0,
  intervalId: null,
  completedCount: 0,
  leaveUnchecked: false,
  headings: [],
  totalLines: 0,
  allTasks: [],
  sectionIdx: "",
};

const state = window[RR_STATE_KEY] || defaultState;
window[RR_STATE_KEY] = state;

// Migrate state shape from an older version of this script that may still be
// live in `window` from before a code edit — Dataview reruns the block in
// place, it doesn't reset globals.
if (state.noteQuery === undefined) state.noteQuery = state.query || "";
if (state.runTasks === undefined) state.runTasks = [];
if (state.screen === "pick" || state.screen === "review") state.screen = "setup";
if (Array.isArray(state.tasks)) {
  state.tasks = state.tasks.map((t) => (t.selected === undefined ? { ...t, selected: true } : t));
}

let refs = {};

async function loadFileData(file) {
  const content = await app.vault.read(file);
  const lines = content.split("\n");
  const headings = [];
  const tasks = [];
  lines.forEach((line, i) => {
    const hm = line.match(HEADING_RE);
    if (hm) headings.push({ line: i, level: hm[1].length, text: hm[2] });
    const tm = line.match(TASK_LINE_RE);
    if (tm && tm[2] === " ") {
      const desc = tm[4];
      tasks.push({
        line: i,
        display: desc.replace(TIME_GOAL_RE, "").replace(COUNT_GOAL_RE, "").replace(/\s{2,}/g, " ").trim(),
        estimateMs: parseEstimateMs(desc),
        goalCount: parseGoalCount(desc),
      });
    }
  });
  return { totalLines: lines.length, headings, tasks };
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
  if (state.sectionIdx === "") {
    state.tasks = state.allTasks.map((t) => ({ ...t, selected: true }));
  } else {
    const range = sectionLineRange(state.headings, state.totalLines, parseInt(state.sectionIdx, 10));
    state.tasks = state.allTasks
      .filter((t) => t.line >= range.start && t.line < range.end)
      .map((t) => ({ ...t, selected: true }));
  }
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

async function requestWakeLock() {
  if (!("wakeLock" in navigator)) return;
  try {
    wakeLock = await navigator.wakeLock.request("screen");
    wakeLock.addEventListener("release", () => { wakeLock = null; });
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
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && state.intervalId && !wakeLock) {
    requestWakeLock();
  }
});

function stopTimer() {
  if (state.intervalId) {
    clearInterval(state.intervalId);
    state.intervalId = null;
  }
  releaseWakeLock();
}

function startTimer() {
  stopTimer();
  state.lastTick = Date.now();
  state.intervalId = setInterval(tick, 250);
  requestWakeLock();
}

function tick() {
  const now = Date.now();
  if (!state.paused) state.elapsedMs += now - state.lastTick;
  state.lastTick = now;
  updateTimerDisplay();
}

function updateTimerDisplay() {
  if (state.screen !== "run" || !refs.timerEl) return;
  const task = state.runTasks[state.index];
  if (!task) return;
  const estimateMs = task.estimateMs;
  const remainingMs = estimateMs - state.elapsedMs;
  const overdue = remainingMs < 0;
  refs.timerEl.textContent = formatDuration(remainingMs);
  refs.timerEl.toggleClass("rr-overdue", overdue);
  const pct = Math.min(100, (state.elapsedMs / estimateMs) * 100);
  refs.barFillEl.style.width = pct + "%";
  refs.barFillEl.toggleClass("rr-overdue", overdue);
}

function render() {
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

function renderTaskList() {
  const list = container.createDiv({ cls: "rr-review-list" });
  state.tasks.forEach((t, idx) => {
    const row = list.createDiv({ cls: "rr-review-item" });
    if (!t.selected) row.addClass("rr-review-item-disabled");

    row.createSpan({ cls: "rr-review-text", text: t.display });

    const badges = row.createDiv({ cls: "rr-badge-group" });
    if (t.goalCount != null) {
      badges.createSpan({ cls: "rr-badge", text: `🎯 ${t.goalCount}` });
    }
    badges.createSpan({ cls: "rr-badge", text: formatDuration(t.estimateMs) });

    const checkboxCell = row.createDiv({ cls: "rr-checkbox-cell" });
    const checkbox = checkboxCell.createEl("input", { attr: { type: "checkbox" } });
    checkbox.checked = t.selected;
    checkbox.addEventListener("change", () => {
      t.selected = checkbox.checked;
      render();
    });

    const reorder = row.createDiv({ cls: "rr-reorder" });
    const upBtn = reorder.createEl("button", { cls: "rr-reorder-btn", text: "↑" });
    upBtn.disabled = idx === 0;
    upBtn.addEventListener("click", () => {
      [state.tasks[idx - 1], state.tasks[idx]] = [state.tasks[idx], state.tasks[idx - 1]];
      render();
    });
    const downBtn = reorder.createEl("button", { cls: "rr-reorder-btn", text: "↓" });
    downBtn.disabled = idx === state.tasks.length - 1;
    downBtn.addEventListener("click", () => {
      [state.tasks[idx], state.tasks[idx + 1]] = [state.tasks[idx + 1], state.tasks[idx]];
      render();
    });
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

  renderTaskList();

  const selectedCount = state.tasks.filter((t) => t.selected).length;
  const startBtn = container.createEl("button", {
    cls: "rr-btn rr-btn-primary",
    text: selectedCount > 0 ? `Start routine (${selectedCount} task${selectedCount === 1 ? "" : "s"})` : "Select at least one task",
  });
  startBtn.disabled = selectedCount === 0;
  startBtn.addEventListener("click", () => {
    state.runTasks = state.tasks.filter((t) => t.selected);
    state.index = 0;
    state.elapsedMs = 0;
    state.count = 0;
    state.paused = false;
    state.completedCount = 0;
    state.screen = "run";
    render();
    startTimer();
  });
}

async function selectFile(file) {
  state.file = file;
  state.noteQuery = "";
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
  const task = state.runTasks[state.index];

  const header = container.createDiv({ cls: "rr-header" });
  const runLabel = currentSectionLabel();
  header.createDiv({
    cls: "rr-progress-label",
    text: `Task ${state.index + 1} of ${state.runTasks.length} — ${state.file.basename}${runLabel ? " › " + runLabel : ""}`,
  });
  const stopBtn = header.createEl("button", { cls: "rr-btn-stop", text: "Stop" });
  stopBtn.addEventListener("click", () => stopRoutine());

  const card = container.createDiv({ cls: "rr-card" });
  card.createDiv({ cls: "rr-task-text", text: task.display });
  card.createDiv({ cls: "rr-est", text: `Estimated: ${formatDuration(task.estimateMs)}` });

  if (task.goalCount != null) {
    const countRow = card.createDiv({ cls: "rr-count-row" });
    const minusBtn = countRow.createEl("button", { cls: "rr-btn rr-count-btn", text: "−" });
    let valueEl = countRow.createSpan({ cls: "rr-count-value", text: String(state.count) });
    countRow.createSpan({ cls: "rr-count-sep", text: "/" });
    countRow.createSpan({ cls: "rr-count-goal", text: String(task.goalCount) });
    const plusBtn = countRow.createEl("button", { cls: "rr-btn rr-count-btn", text: "+" });

    function setCount(n) {
      state.count = Math.max(0, n);
      valueEl.textContent = String(state.count);
    }

    function startEdit() {
      const input = document.createElement("input");
      input.type = "number";
      input.className = "rr-count-input";
      input.value = String(state.count);
      valueEl.replaceWith(input);
      input.focus();
      input.select();
      const commit = () => {
        const n = parseInt(input.value, 10);
        setCount(isNaN(n) ? state.count : n);
        input.replaceWith(valueEl);
      };
      input.addEventListener("blur", commit);
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") input.blur();
        if (e.key === "Escape") { input.value = String(state.count); input.blur(); }
      });
    }

    minusBtn.addEventListener("click", () => setCount(state.count - 1));
    plusBtn.addEventListener("click", () => setCount(state.count + 1));
    valueEl.addEventListener("click", startEdit);
  }

  const timerRow = card.createDiv({ cls: "rr-timer-row" });
  refs.timerEl = timerRow.createDiv({ cls: "rr-timer", text: "0:00" });

  const bar = card.createDiv({ cls: "rr-bar" });
  refs.barFillEl = bar.createDiv({ cls: "rr-bar-fill" });

  const btnRow = card.createDiv({ cls: "rr-btn-row" });
  const pauseBtn = btnRow.createEl("button", { cls: "rr-btn", text: state.paused ? "Resume" : "Pause" });
  pauseBtn.addEventListener("click", () => {
    state.paused = !state.paused;
    state.lastTick = Date.now();
    pauseBtn.textContent = state.paused ? "Resume" : "Pause";
  });
  const skipBtn = btnRow.createEl("button", { cls: "rr-btn", text: "Skip" });
  skipBtn.addEventListener("click", () => advance(false));
  const doneBtn = btnRow.createEl("button", { cls: "rr-btn rr-btn-primary", text: "Done" });
  doneBtn.addEventListener("click", () => completeCurrentTask());

  const next = state.runTasks[state.index + 1];
  container.createDiv({
    cls: "rr-next",
    text: next ? `Next: ${next.display} (${formatDuration(next.estimateMs)})` : "This is the last task.",
  });

  updateTimerDisplay();
}

function renderDone() {
  stopTimer();
  container.createDiv({ cls: "rr-header" }).createEl("h3", { text: "Routine complete 🎉" });
  container.createDiv({ text: `${state.completedCount} of ${state.runTasks.length} tasks marked done.` });
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

function advance(wasDone) {
  if (wasDone) state.completedCount++;
  state.index++;
  state.elapsedMs = 0;
  state.count = 0;
  state.paused = false;
  state.screen = state.index >= state.runTasks.length ? "done" : "run";
  render();
}

// Tasks plugin's own toggle command respects custom done symbols and recurrence;
// it can return multiple lines (e.g. a new recurring instance), so later tasks'
// stored line numbers are shifted to match.
async function completeCurrentTask() {
  if (state.leaveUnchecked) {
    advance(true);
    return;
  }

  const task = state.runTasks[state.index];
  const content = await app.vault.read(state.file);
  const lines = content.split("\n");
  const rawLine = lines[task.line];

  const tasksApi = app.plugins.plugins["obsidian-tasks-plugin"]?.apiV1;
  let replacement;
  if (tasksApi && typeof tasksApi.executeToggleTaskDoneCommand === "function") {
    replacement = tasksApi.executeToggleTaskDoneCommand(rawLine, state.file.path);
  } else {
    replacement = rawLine.replace(TASK_LINE_RE, (m, p1, p2, p3, p4) => `${p1}x${p3}${p4}`);
  }

  const elapsedLabel = formatDuration(state.elapsedMs);
  const resultText = task.goalCount != null ? `🏁 ${elapsedLabel} 🥅 ${state.count}` : `🏁 ${elapsedLabel}`;
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
    state.runTasks.forEach((t) => { if (t.line > task.line) t.line += shift; });
  }

  advance(true);
}

render();
// Rehydrated mid-routine from a prior execution: resume ticking in this
// context. startTimer() clears any interval id first, so this is safe even
// if the old instance's watchdog (below) hasn't fired yet to null it out.
if (state.screen === "run") startTimer();

const watchdog = new MutationObserver(() => {
  if (!document.body.contains(container)) {
    stopTimer();
    watchdog.disconnect();
  }
});
watchdog.observe(document.body, { childList: true, subtree: true });
```

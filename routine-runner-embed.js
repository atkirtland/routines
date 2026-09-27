/* Reusable nested-task component for Routine Runner and other DataviewJS views. */
(function (root, factory) {
  const api = factory(root.RoutineRunner);
  if (typeof module === "object" && module.exports) module.exports = api;
  root.RoutineRunnerEmbed = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (RR) {
  "use strict";

  function requireCore() {
    if (!RR) throw new Error("RoutineRunner core must be loaded before routine-runner-embed.js");
    return RR;
  }

  const SHARED_STYLE_ID = "routine-runner-shared-style";
  const SHARED_CSS = `
    .rr-root,.rr-embedded{font-size:var(--font-text-size)}
    .rr-setup-tools{position:sticky;top:0;z-index:2;padding:.55em;margin-bottom:.6em;border:1px solid var(--background-modifier-border);border-radius:6px;background:var(--background-primary);box-shadow:0 2px 8px rgba(0,0,0,.12)}
    .rr-tools-row{display:flex;align-items:center;flex-wrap:wrap;gap:.4em}.rr-tools-row+.rr-tools-row{margin-top:.45em}.rr-tools-row .rr-input{flex:1 1 14em;width:auto;margin:0}
    .rr-input{width:100%;box-sizing:border-box;padding:6px 10px;border-radius:6px;border:1px solid var(--background-modifier-border);background:var(--background-primary);color:var(--text-normal);margin-bottom:.5em}
    .rr-tool-btn{padding:4px 8px;font-size:.82em;border-radius:5px;border:1px solid var(--background-modifier-border);background:var(--interactive-normal);color:var(--text-normal);cursor:pointer}.rr-tool-btn:hover{background:var(--interactive-hover)}.rr-reset-btn{margin-left:auto}
    .rr-summary{margin-left:auto;color:var(--text-muted);font-size:.85em;white-space:nowrap}
    .rr-review-list{display:grid;grid-template-columns:minmax(0,1fr) auto auto auto;align-items:stretch;column-gap:0;padding:0 10px;border:1px solid var(--background-modifier-border);border-radius:6px;margin-bottom:.75em}.rr-review-item{display:contents}.rr-review-item>*{padding:6px 0;border-bottom:1px solid var(--background-modifier-border);box-sizing:border-box}.rr-review-list>.rr-review-item:last-child>*{border-bottom:none}
    .rr-review-item-disabled>*{opacity:.45}.rr-review-item-disabled .rr-review-text{text-decoration:line-through}.rr-review-item-context .rr-review-label{color:var(--text-muted);font-style:italic}.rr-review-item-active>*{background:var(--background-modifier-hover)}
    .rr-review-text{display:flex;align-items:center;min-width:0}.rr-review-label{min-width:0;overflow:hidden;text-overflow:ellipsis}.rr-disclosure{flex:none;width:1.4em;margin-left:.35em;padding:0;border:0;background:transparent;color:var(--text-muted);cursor:pointer}
    .rr-badge{color:var(--text-muted);font-size:.8em;background:var(--background-secondary);border-radius:4px;padding:1px 6px;white-space:nowrap}.rr-badge-group{display:flex;align-items:center;justify-content:flex-end;gap:.4em;padding-left:.6em}.rr-checkbox-cell{display:flex;align-items:center;justify-content:center;padding-left:.6em}.rr-reorder{display:flex;align-items:center;justify-content:center;gap:2px;padding-left:.6em}.rr-reorder-btn{line-height:1;font-size:.7em;padding:2px 6px;border-radius:4px;border:1px solid var(--background-modifier-border);background:var(--interactive-normal);color:var(--text-normal);cursor:pointer}.rr-reorder-btn:hover:not(:disabled){background:var(--interactive-hover)}.rr-reorder-btn:disabled{opacity:.3;cursor:default}
    .rr-empty{color:var(--text-muted);padding:8px 0}.rr-selection-header{display:flex;align-items:center;gap:.75em;margin-bottom:.6em}
    .rr-header{display:flex;align-items:center;justify-content:space-between;gap:.75em;margin-bottom:.5em}.rr-card{border:1px solid var(--background-modifier-border);border-radius:8px;padding:1em;background:var(--background-secondary)}
    .rr-task-text{font-size:1.15em;font-weight:600;margin-bottom:.25em}.rr-embedded-crumbs{display:flex;align-items:center;gap:.15em;flex-wrap:wrap}.rr-crumb{cursor:pointer;color:var(--interactive-accent)}.rr-crumb-current{cursor:default;color:var(--text-normal)}.rr-crumb-sep{color:var(--text-faint);padding:0 .35em}.rr-est,.rr-next{color:var(--text-muted);font-size:.85em;margin-bottom:.75em}
    .rr-timer-row{text-align:center}.rr-timer{font-size:2.2em;font-weight:700;font-variant-numeric:tabular-nums;color:var(--text-normal)}.rr-timer.rr-overdue{color:var(--color-red,#e5534b)}.rr-bar{height:10px;border-radius:5px;background:var(--background-modifier-border);overflow:hidden;margin:.75em 0 1em}.rr-bar-fill{height:100%;width:0;background:var(--color-green,#4caf50);transition:width .2s linear,background-color .2s linear}.rr-bar-fill.rr-overdue{background:var(--color-red,#e5534b)}
    .rr-count-row{display:flex;align-items:center;justify-content:center;gap:.6em;margin:.75em 0 1em}.rr-count-btn{flex:none;width:2.4em;font-size:1.2em;padding:6px 0}.rr-count-value{font-size:1.8em;font-weight:700;min-width:1.4em;text-align:center;cursor:pointer;border-bottom:1px dashed var(--text-faint)}.rr-count-value:hover{color:var(--interactive-accent)}.rr-count-sep{color:var(--text-muted);font-size:1.4em}.rr-count-goal{color:var(--text-muted);font-size:1.4em;font-weight:600}.rr-count-input{font-size:1.8em;font-weight:700;width:3.2em;text-align:center;border-radius:4px;border:1px solid var(--background-modifier-border);background:var(--background-primary);color:var(--text-normal)}
    .rr-btn-row{display:flex;gap:.5em}.rr-btn{flex:1;padding:8px;border-radius:6px;border:1px solid var(--background-modifier-border);background:var(--interactive-normal);color:var(--text-normal);cursor:pointer}.rr-btn:hover{background:var(--interactive-hover)}.rr-btn:disabled{opacity:.5;cursor:default}.rr-btn-primary{background:var(--interactive-accent);color:var(--text-on-accent);border-color:var(--interactive-accent)}.rr-btn-primary:hover{background:var(--interactive-accent-hover)}.rr-btn-stop{flex:none;padding:4px 14px;font-size:.85em;border-radius:6px;border:1px solid var(--background-modifier-border);background:var(--interactive-normal);color:var(--text-normal);cursor:pointer}.rr-btn-stop:hover{background:var(--interactive-hover)}.rr-next{margin-top:.75em;margin-bottom:0;font-size:.9em}.rr-progress-label{font-weight:600}
    .rr-status-menu{position:fixed;z-index:var(--layer-menu,1000);min-width:190px;max-height:60vh;overflow:auto;padding:4px;border:1px solid var(--background-modifier-border);border-radius:6px;background:var(--background-primary);box-shadow:var(--shadow-s)}.rr-status-option{display:flex;width:100%;gap:.6em;align-items:center;padding:6px 9px;border:0;border-radius:4px;background:transparent;color:var(--text-normal);text-align:left;cursor:pointer}.rr-status-option:hover,.rr-status-option:focus{background:var(--background-modifier-hover)}.rr-status-symbol{min-width:2.2em;font-family:var(--font-monospace)}.rr-status-type{margin-left:auto;color:var(--text-muted);font-size:.8em}
  `;

  function installStyles(doc = document) {
    const stale = doc.getElementById("routine-runner-shared-selection-style");
    if (stale) stale.remove();
    if (doc.getElementById(SHARED_STYLE_ID)) return;
    const style = doc.createElement("style");
    style.id = SHARED_STYLE_ID;
    style.textContent = SHARED_CSS;
    doc.head.appendChild(style);
  }

  function model(content, rootLine, focusLine = rootLine, defaultEstimateMs) {
    const core = requireCore();
    const parsed = core.parseRoutineText(content, defaultEstimateMs);
    parsed.tasks.forEach(node => { node.display = node.display.replace(/\s+\^[\p{L}\p{N}_-]+\s*$/u, ""); });
    const sourceRoot = core.taskAtLine(parsed, rootLine);
    if (!sourceRoot) return null;
    const allowed = new Set(core.flatten([sourceRoot]).map(node => node.id));
    let focus = parsed.tasks.find(node => node.line === focusLine && allowed.has(node.id)) || sourceRoot;
    const map = new Map(parsed.tasks.map(node => [node.id, node]));
    const path = core.taskPath(focus, map).filter(node => allowed.has(node.id));
    const descendants = core.flatten(sourceRoot.children);
    return {
      root: sourceRoot,
      focus,
      path,
      children: focus.children,
      leaves: core.flatten([sourceRoot]).filter(node => !node.children.length && !node.checked),
      hasIncompleteDescendants: descendants.some(node => !node.checked),
      complete: core.flatten([sourceRoot]).filter(node => node.checked).length,
      total: core.flatten([sourceRoot]).length,
    };
  }

  function replacementForTask(rawLine, replacementFromTasksPlugin = null, status = null) {
    const core = requireCore();
    if (!rawLine?.match(core.TASK_LINE_RE)) throw new Error("Referenced line is no longer a task");
    if (replacementFromTasksPlugin && status === null) return replacementFromTasksPlugin;
    const symbol = status?.symbol ?? "x";
    return rawLine.replace(core.TASK_LINE_RE, (m, p1, p2, p3, p4) => `${p1}${symbol}${p3}${p4}`);
  }

  async function completeTask(app, file, content, line, status = null, result = null) {
    const lines = content.split(/\r?\n/);
    const rawLine = lines[line];
    const api = app.plugins?.plugins?.["obsidian-tasks-plugin"]?.apiV1;
    const terminal = !status || ["DONE", "CANCELLED", "NON_TASK"].includes(status.type);
    const transformed = terminal && typeof api?.executeToggleTaskDoneCommand === "function"
      ? api.executeToggleTaskDoneCommand(rawLine, file.path)
      : null;
    let replacement = replacementForTask(rawLine, transformed, status);
    if (status && terminal) {
      let settings = null;
      try { settings = await app.plugins?.plugins?.["obsidian-tasks-plugin"]?.loadData?.(); } catch (_) {}
      const date = new Date().toISOString().slice(0, 10);
      replacement = replacement.split("\n").map(value => {
        const match = value.match(requireCore().TASK_LINE_RE);
        if (!match || match[2] === " ") return value;
        let changed = value.replace(requireCore().TASK_LINE_RE, (m, p1, p2, p3, p4) => `${p1}${status.symbol}${p3}${p4}`)
          .replace(/\s+[✅❌]\s*\d{4}-\d{2}-\d{2}/gu, "").replace(/\s+$/, "");
        if (status.type === "DONE" && settings?.setDoneDate !== false) changed += ` ✅ ${date}`;
        if (status.type === "CANCELLED" && settings?.setCancelledDate !== false) changed += ` ❌ ${date}`;
        return changed;
      }).join("\n");
    }
    if (result) {
      const label = result.goalCount != null
        ? `🏁 ${requireCore().formatDuration(result.elapsedMs)} 🥅 ${result.count || 0}`
        : `🏁 ${requireCore().formatDuration(result.elapsedMs)}`;
      replacement = replacement.split("\n").map(value => {
        const match = value.match(requireCore().TASK_LINE_RE);
        return match && match[2] !== " " ? requireCore().insertBeforeTasksMetadata(value, label) : value;
      }).join("\n");
    }
    lines.splice(line, 1, ...replacement.split("\n"));
    const next = lines.join("\n");
    await app.vault.modify(file, next);
    return next;
  }

  function renderBreadcrumbs(container, path, currentLine, onFocus, buttonMode = true) {
    path.forEach((node, index) => {
      if (index) container.createSpan({ cls: "rr-crumb-sep", text: "→" });
      const current = node.line === currentLine;
      const crumb = buttonMode
        ? container.createEl("button", { cls: "rr-embedded-crumb", text: node.display })
        : container.createSpan({ cls: current ? "rr-crumb rr-crumb-current" : "rr-crumb", text: node.display });
      if (buttonMode) crumb.disabled = current;
      if (!current) crumb.addEventListener("click", () => onFocus?.(node.line, node));
    });
  }


  function createRunState() {
    return { focusKey: null, activeLeafKey: null, retired: [], sessions: {}, completedCount: 0, processedCount: 0 };
  }

  // The host owns the envelope and storage location.  This deliberately small
  // serializer is shared by standalone and scheduled hosts so a session never
  // acquires host-specific fields (Actual entries, UI nodes, file objects, etc.).
  function serializeSession(state) {
    const clean = JSON.parse(JSON.stringify(state || createRunState()));
    delete clean.intervalId;
    clean.schemaVersion = 2;
    return clean;
  }

  function deserializeSession(value) {
    const fresh = createRunState();
    if (!value || typeof value !== "object") return fresh;
    const state = Object.assign(fresh, JSON.parse(JSON.stringify(value)));
    state.sessions = state.sessions && typeof state.sessions === "object" ? state.sessions : {};
    Object.values(state.sessions).forEach(session => {
      session.elapsedBeforeStartMs = Math.max(0, Number(session.elapsedBeforeStartMs) || 0);
      session.startedAt = session.startedAt == null || !Number.isFinite(Number(session.startedAt)) ? null : Number(session.startedAt);
      session.count = Math.max(0, Number(session.count) || 0);
    });
    state.retired = Array.isArray(state.retired) ? state.retired : [];
    state.selected = Array.isArray(state.selected) ? state.selected : [];
    state.order = Array.isArray(state.order) ? state.order : [];
    if (!state.screen) state.screen = state.activeLeafKey || Object.keys(state.sessions).length ? "run" : "select";
    state.schemaVersion = 2;
    return state;
  }

  function sessionElapsedTotal(state, now = Date.now()) {
    return Object.values(state?.sessions || {}).reduce((sum, session) => sum + requireCore().elapsedForSession(session, now), 0);
  }

  function runningSession(state) {
    return state?.screen === "run" && Object.values(state.sessions || {}).some(session => session?.startedAt != null);
  }

  function enabledLeaves(tasks) {
    const leaves = [];
    function visit(node, ancestorsEnabled) {
      const enabled = ancestorsEnabled && node.selected !== false;
      if (!node.children.length) {
        if (enabled) leaves.push(node);
        return;
      }
      node.children.forEach(child => visit(child, enabled));
    }
    tasks.forEach(node => visit(node, true));
    return leaves;
  }

  // The setup tree is deliberately host-agnostic. Standalone supplies the
  // selected note/section tree; Schedule Runner supplies the linked root tree.
  // Both therefore get the same hierarchy, controls, and keyboard behavior.
  function renderSelection(container, options) {
    const core = requireCore();
    const state = options.state;
    const tasks = options.tasks || [];
    state.taskQuery = state.taskQuery || "";
    state.collapsedIds = Array.isArray(state.collapsedIds) ? state.collapsedIds : [];
    state.setupCursorId = state.setupCursorId || null;
    const redraw = focusSearch => {
      options.onChange?.(state);
      options.render();
      if (focusSearch && typeof requestAnimationFrame === "function") requestAnimationFrame(() => {
        const next = container.querySelector(".rr-task-search");
        if (next) { next.focus(); next.setSelectionRange(next.value.length, next.value.length); }
      });
    };
    const visibleRows = () => {
      const query = state.taskQuery.trim().toLowerCase();
      const collapsed = new Set(state.collapsedIds);
      const rows = [];
      function visit(node, siblings, idx, depth, ancestorsEnabled) {
        const selfMatches = !query || node.display.toLowerCase().includes(query);
        const descendantMatches = node.children.some(function hasMatch(child) {
          return child.display.toLowerCase().includes(query) || child.children.some(hasMatch);
        });
        if (!selfMatches && !descendantMatches) return;
        const effectiveHere = ancestorsEnabled && node.selected !== false;
        rows.push({ node, siblings, idx, depth, ancestorsEnabled, effectiveHere, selfMatches });
        if (query || !collapsed.has(node.id)) node.children.forEach((child, childIdx) => visit(child, node.children, childIdx, depth + 1, effectiveHere));
      }
      tasks.forEach((node, idx) => visit(node, tasks, idx, 0, true));
      return rows;
    };

    const tools = container.createDiv({ cls: "rr-setup-tools" });
    const top = tools.createDiv({ cls: "rr-tools-row" });
    const search = top.createEl("input", { cls: "rr-input rr-task-search", attr: { type: "search", placeholder: "Search tasks…  (Vim: /)" } });
    search.value = state.taskQuery;
    search.addEventListener("input", () => { state.taskQuery = search.value; redraw(true); });
    const leaves = enabledLeaves(tasks);
    top.createSpan({ cls: "rr-summary", text: `${leaves.length} leaf task${leaves.length === 1 ? "" : "s"} · ${core.formatDuration(leaves.reduce((sum, leaf) => sum + leaf.estimateMs, 0))}` });
    const actions = tools.createDiv({ cls: "rr-tools-row" });
    const matchingNodes = () => visibleRows().filter(row => row.selfMatches).map(row => row.node);
    const selectionNodes = () => state.taskQuery.trim() ? matchingNodes() : tasks;
    const structureNodes = () => state.taskQuery.trim() ? matchingNodes() : core.flatten(tasks);
    const action = (label, handler, cls = "rr-tool-btn") => {
      const button = actions.createEl("button", { cls, text: label });
      button.addEventListener("click", handler);
      return button;
    };
    action("Enable", () => { selectionNodes().forEach(node => { node.selected = true; }); redraw(); });
    action("Disable", () => { selectionNodes().forEach(node => { node.selected = false; }); redraw(); });
    action("Expand", () => { const ids = new Set(structureNodes().map(node => node.id)); state.collapsedIds = state.collapsedIds.filter(id => !ids.has(id)); redraw(); });
    action("Collapse", () => { state.collapsedIds = [...new Set([...state.collapsedIds, ...structureNodes().filter(node => node.children.length).map(node => node.id)])]; redraw(); });
    action("Reset", () => { state.taskQuery = ""; state.collapsedIds = []; state.setupCursorId = null; options.onReset?.(); redraw(); }, "rr-tool-btn rr-reset-btn");

    const list = container.createDiv({ cls: "rr-review-list" });
    list.tabIndex = 0;
    list.setAttribute("aria-label", "Task tree; use Vim keys j/k, h/l, x, Shift-J/Shift-K, gg/G, and slash");
    const rows = visibleRows();
    if (!rows.some(row => row.node.id === state.setupCursorId)) state.setupCursorId = rows[0]?.node.id ?? null;
    if (!rows.length) { list.createDiv({ cls: "rr-empty", text: "No matching tasks." }); return; }
    rows.forEach(({ node, siblings, idx, depth, ancestorsEnabled, effectiveHere, selfMatches }) => {
      const row = list.createDiv({ cls: "rr-review-item" });
      if (!effectiveHere) row.addClass("rr-review-item-disabled");
      if (state.taskQuery.trim() && !selfMatches) row.addClass("rr-review-item-context");
      if (node.id === state.setupCursorId) row.addClass("rr-review-item-active");
      const text = row.createSpan({ cls: "rr-review-text" });
      text.style.paddingLeft = `${depth * 1.25}em`;
      text.createSpan({ cls: "rr-review-label", text: node.display });
      if (node.children.length) {
        const disclosure = text.createEl("button", { cls: "rr-disclosure", text: state.collapsedIds.includes(node.id) && !state.taskQuery ? "▸" : "▾", attr: { "aria-label": state.collapsedIds.includes(node.id) ? "Expand branch" : "Collapse branch" } });
        disclosure.addEventListener("click", event => { event.stopPropagation(); state.collapsedIds = state.collapsedIds.includes(node.id) ? state.collapsedIds.filter(id => id !== node.id) : [...state.collapsedIds, node.id]; redraw(); });
      }
      text.addEventListener("click", () => { state.setupCursorId = node.id; redraw(); if (typeof requestAnimationFrame === "function") requestAnimationFrame(() => container.querySelector(".rr-review-list")?.focus()); });
      const badges = row.createDiv({ cls: "rr-badge-group" });
      if (node.goalCount != null) badges.createSpan({ cls: "rr-badge", text: `🎯 ${node.goalCount}` });
      badges.createSpan({ cls: "rr-badge", text: core.formatDuration(node.estimateMs) });
      const checkboxCell = row.createDiv({ cls: "rr-checkbox-cell" });
      const checkbox = checkboxCell.createEl("input", { attr: { type: "checkbox" } });
      checkbox.checked = node.selected !== false; checkbox.disabled = !ancestorsEnabled;
      checkbox.addEventListener("change", () => { node.selected = checkbox.checked; redraw(); });
      const reorder = row.createDiv({ cls: "rr-reorder" });
      const move = delta => { const target = idx + delta; if (target < 0 || target >= siblings.length) return; [siblings[idx], siblings[target]] = [siblings[target], siblings[idx]]; redraw(); };
      const up = reorder.createEl("button", { cls: "rr-reorder-btn", text: "↑" }); up.disabled = !ancestorsEnabled || idx === 0; up.addEventListener("click", () => move(-1));
      const down = reorder.createEl("button", { cls: "rr-reorder-btn", text: "↓" }); down.disabled = !ancestorsEnabled || idx === siblings.length - 1; down.addEventListener("click", () => move(1));
    });
    let pendingG = false;
    list.addEventListener("keydown", event => {
      if (["INPUT", "BUTTON"].includes(event.target.tagName)) return;
      const current = rows.findIndex(row => row.node.id === state.setupCursorId); let next = current;
      if (event.key === "j") next = Math.min(rows.length - 1, current + 1);
      else if (event.key === "k") next = Math.max(0, current - 1);
      else if (event.key === "G") next = rows.length - 1;
      else if (event.key === "g") { if (pendingG) next = 0; pendingG = !pendingG; event.preventDefault(); if (next !== current) { state.setupCursorId = rows[next].node.id; redraw(); } return; }
      else if (event.key === "/") { event.preventDefault(); container.querySelector(".rr-task-search")?.focus(); return; }
      else if ([" ", "x"].includes(event.key)) { const item = rows[current]; if (item?.ancestorsEnabled) item.node.selected = item.node.selected === false; }
      else if (event.key === "h") { const item = rows[current]; if (item?.node.children.length && !state.collapsedIds.includes(item.node.id)) state.collapsedIds.push(item.node.id); }
      else if (event.key === "l") state.collapsedIds = state.collapsedIds.filter(id => id !== rows[current]?.node.id);
      else if (["K", "J"].includes(event.key)) { const item = rows[current], target = item ? item.idx + (event.key === "K" ? -1 : 1) : -1; if (item?.ancestorsEnabled && target >= 0 && target < item.siblings.length) [item.siblings[item.idx], item.siblings[target]] = [item.siblings[target], item.siblings[item.idx]]; }
      else return;
      pendingG = false; event.preventDefault(); if (next !== current && rows[next]) state.setupCursorId = rows[next].node.id; redraw();
    });
  }

  function lineForKey(content, rootLine, key, defaultEstimateMs) {
    const core = requireCore(), current = model(content, rootLine, rootLine, defaultEstimateMs);
    if (!current) return null;
    const all = core.flatten([current.root]), map = new Map(all.map(node => [node.id, node]));
    return all.find(node => core.taskPath(node, map).map(part => part.display).join("\u0000") === key)?.line ?? null;
  }

  async function configuredTaskStatuses(app) {
    const defaults = [{ symbol: " ", name: "Todo", type: "TODO" }, { symbol: "x", name: "Done", type: "DONE" }];
    const fallback = [{ symbol: "/", name: "In Progress", type: "IN_PROGRESS" }, { symbol: "-", name: "Cancelled", type: "CANCELLED" }];
    let settings = null;
    try { settings = await app.plugins?.plugins?.["obsidian-tasks-plugin"]?.loadData?.(); } catch (_) {}
    const values = [...(settings?.statusSettings?.coreStatuses ?? defaults), ...(settings?.statusSettings?.customStatuses ?? fallback)];
    const seen = new Set();
    return values.filter(value => typeof value?.symbol === "string" && value.symbol.length === 1 && !seen.has(value.symbol) && seen.add(value.symbol));
  }

  async function showStatusMenu(app, anchor, choose) {
    const menu = document.body.createDiv({ cls: "rr-status-menu" });
    for (const status of await configuredTaskStatuses(app)) {
      const option = menu.createEl("button", { cls: "rr-status-option" });
      option.createSpan({ cls: "rr-status-symbol", text: `[${status.symbol}]` });
      option.createSpan({ text: status.name || "Unnamed" });
      if (status.type) option.createSpan({ cls: "rr-status-type", text: status.type.replaceAll("_", " ") });
      option.addEventListener("click", () => { menu.remove(); choose(status.symbol === "x" ? null : status); });
    }
    const rect = anchor.getBoundingClientRect(), box = menu.getBoundingClientRect();
    menu.style.left = `${Math.max(4, Math.min(rect.right - box.width, innerWidth - box.width - 4))}px`;
    menu.style.top = `${Math.max(4, rect.top >= box.height + 6 ? rect.top - box.height - 6 : rect.bottom + 6)}px`;
    menu.tabIndex = -1; menu.focus();
    menu.addEventListener("keydown", event => { if (event.key === "Escape") menu.remove(); });
    menu.addEventListener("focusout", () => setTimeout(() => { if (!menu.contains(document.activeElement)) menu.remove(); }, 0));
  }

  function renderRunCard(container, options) {
    const core = requireCore();
    const task = options.task;
    const session = options.session;
    const header = container.createDiv({ cls: "rr-header rr-embedded-header" });
    header.createDiv({ cls: "rr-progress-label", text: options.progressLabel });
    const stop = header.createEl("button", { cls: "rr-btn-stop", text: "Stop" });
    stop.addEventListener("click", () => options.onStop?.());

    const card = container.createDiv({ cls: "rr-card" });
    const crumbs = card.createDiv({ cls: "rr-task-text rr-embedded-crumbs" });
    renderBreadcrumbs(crumbs, options.path, task.line, (_line, node) => options.onFocus?.(node), false);
    card.createDiv({ cls: "rr-est", text: `Estimated: ${core.formatDuration(task.estimateMs)}` });
    const changed = () => options.onStateChange?.();
    if (task.goalCount != null) {
      const row = card.createDiv({ cls: "rr-count-row" });
      const minus = row.createEl("button", { cls: "rr-btn rr-count-btn", text: "−" });
      const value = row.createSpan({ cls: "rr-count-value", text: String(session.count || 0) });
      row.createSpan({ cls: "rr-count-sep", text: "/" });
      row.createSpan({ cls: "rr-count-goal", text: String(task.goalCount) });
      const plus = row.createEl("button", { cls: "rr-btn rr-count-btn", text: "+" });
      const setCount = number => { session.count = Math.max(0, number); value.textContent = String(session.count); changed(); };
      minus.addEventListener("click", () => setCount((session.count || 0) - 1));
      plus.addEventListener("click", () => setCount((session.count || 0) + 1));
      value.addEventListener("click", () => {
        const input = document.createElement("input"); input.type = "number"; input.className = "rr-count-input"; input.value = String(session.count || 0);
        value.replaceWith(input); input.focus(); input.select();
        const commit = () => { setCount(Number.parseInt(input.value, 10) || 0); input.replaceWith(value); };
        input.addEventListener("blur", commit);
        input.addEventListener("keydown", event => { if (event.key === "Enter") input.blur(); if (event.key === "Escape") { input.value = String(session.count || 0); input.blur(); } });
      });
    }
    const timerRow = card.createDiv({ cls: "rr-timer-row" });
    const timer = timerRow.createDiv({ cls: "rr-timer", text: "0:00" });
    const bar = card.createDiv({ cls: "rr-bar" });
    const fill = bar.createDiv({ cls: "rr-bar-fill" });
    const repaint = () => {
      const elapsed = core.elapsedForSession(session);
      const remaining = task.estimateMs - elapsed;
      timer.textContent = core.formatDuration(options.countDown === false ? elapsed : remaining);
      const overdue = remaining < 0;
      fill.style.width = `${task.estimateMs ? Math.min(100, elapsed / task.estimateMs * 100) : 0}%`;
      timer.classList.toggle("rr-overdue", overdue); fill.classList.toggle("rr-overdue", overdue);
    };
    repaint();
    const interval = setInterval(repaint, options.redrawIntervalMs || 1000);
    let wakeLock = null, disposed = false;
    if (typeof navigator !== "undefined" && "wakeLock" in navigator) navigator.wakeLock.request("screen").then(lock => { if (disposed) lock.release().catch(() => {}); else wakeLock = lock; }).catch(() => {});
    const dispose = () => { if (disposed) return; disposed = true; clearInterval(interval); wakeLock?.release().catch(() => {}); wakeLock = null; };
    const buttons = card.createDiv({ cls: "rr-btn-row" });
    const pause = buttons.createEl("button", { cls: "rr-btn", text: session.startedAt == null ? "Resume" : "Pause" });
    pause.addEventListener("click", () => { options.onPause?.(); pause.textContent = session.startedAt == null ? "Resume" : "Pause"; repaint(); changed(); });
    const skip = buttons.createEl("button", { cls: "rr-btn", text: "Skip" });
    skip.addEventListener("click", () => { dispose(); options.onSkip?.(); });
    const done = buttons.createEl("button", { cls: "rr-btn rr-btn-primary", text: "Done" });
    const finish = status => { done.disabled = true; Promise.resolve(options.onDone?.(status)).catch(error => { done.disabled = false; throw error; }); };
    done.addEventListener("click", () => finish(null));
    done.title = "Right-click to choose a Tasks status";
    done.addEventListener("contextmenu", event => { event.preventDefault(); showStatusMenu(options.app, done, finish); });
    container.createDiv({ cls: "rr-next", text: options.nextLabel || "This is the last remaining leaf task." });
    return { dispose, repaint };
  }

  function renderSummary(container, summary, options = {}) {
    container.createDiv({ cls: "rr-header" }).createEl("h3", { text: "Routine complete 🎉" });
    container.createDiv({ cls: "rr-embedded-progress", text: `${summary.elapsedMs != null ? `${requireCore().formatDuration(summary.elapsedMs)} total · ` : ""}${summary.processedCount} of ${summary.totalLeafCount} leaf tasks processed · ${summary.completedCount} completed` });
    if (options.actionLabel) {
      const action = container.createEl("button", { cls: "rr-btn rr-btn-primary", text: options.actionLabel });
      action.addEventListener("click", options.onAction);
    }
  }

  function renderRunner(container, options) {
    const core = requireCore();
    const state = options.state || createRunState();
    const current = model(options.content, options.rootLine, options.rootLine, options.defaultEstimateMs);
    container.empty?.();
    if (!current) {
      container.createDiv({ cls: "rr-embedded-error", text: "Referenced task no longer exists." });
      return { model: null, dispose() {} };
    }
    const all = core.flatten([current.root]);
    const map = new Map(all.map(node => [node.id, node]));
    const keyOf = node => core.taskPath(node, map).map(part => part.display).join("\u0000");
    const byKey = new Map(all.map(node => [keyOf(node), node]));
    const retired = new Set(state.retired || []);
    const orderIndex = new Map((state.order || []).map((key, index) => [key, index]));
    const leaves = all.filter(node => !node.children.length && !node.checked && !retired.has(keyOf(node)))
      .sort((a, b) => (orderIndex.get(keyOf(a)) ?? Number.MAX_SAFE_INTEGER) - (orderIndex.get(keyOf(b)) ?? Number.MAX_SAFE_INTEGER));
    let activeLeaf = byKey.get(state.activeLeafKey);
    if (!activeLeaf || activeLeaf.checked || activeLeaf.children.length || retired.has(keyOf(activeLeaf))) activeLeaf = leaves[0] || null;
    if (!activeLeaf) {
      container.createDiv({ cls: "rr-embedded-done", text: "Routine complete 🎉" });
      container.createDiv({ cls: "rr-embedded-progress", text: `${state.processedCount || 0} processed; ${state.completedCount || 0} completed.` });
      return { model: current, dispose() {} };
    }
    state.activeLeafKey = keyOf(activeLeaf);
    let focus = byKey.get(state.focusKey);
    const activePath = core.taskPath(activeLeaf, map);
    if (!focus || !activePath.some(node => node.id === focus.id)) focus = activeLeaf;
    state.focusKey = keyOf(focus);

    const settle = (session, now = Date.now()) => {
      if (session?.startedAt != null) {
        session.elapsedBeforeStartMs = (Number(session.elapsedBeforeStartMs) || 0) + Math.max(0, now - Number(session.startedAt));
        session.startedAt = null;
      }
    };
    const session = state.sessions[state.focusKey] || (state.sessions[state.focusKey] = {
      elapsedBeforeStartMs: 0, startedAt: Date.now(), count: 0,
    });
    const advance = () => {
      settle(session);
      const affected = core.flatten([focus]).filter(node => !node.children.length && !retired.has(keyOf(node))).length;
      core.flatten([focus]).forEach(node => retired.add(keyOf(node)));
      state.retired = [...retired]; state.focusKey = null; state.activeLeafKey = null;
      state.processedCount = (state.processedCount || 0) + affected;
      options.onStateChange?.(state);
      if (options.onRefresh) options.onRefresh(); else renderRunner(container, options);
    };
    const finish = async status => {
      settle(session);
      const affected = core.flatten([focus]).filter(node => !node.children.length && !retired.has(keyOf(node))).length;
      state.completedCount = (state.completedCount || 0) + 1;
      state.processedCount = (state.processedCount || 0) + affected;
      core.flatten([focus]).forEach(node => retired.add(keyOf(node)));
      state.retired = [...retired]; options.onStateChange?.(state);
      try {
        await options.onComplete?.(focus.line, { elapsedMs: core.elapsedForSession(session), count: session.count, goalCount: focus.goalCount }, status);
      } catch (error) {
        state.completedCount--; state.processedCount -= affected;
        core.flatten([focus]).forEach(node => retired.delete(keyOf(node)));
        state.retired = [...retired]; options.onStateChange?.(state);
        throw error;
      }
    };
    const activeIndex = leaves.findIndex(node => node.id === activeLeaf.id);
    const next = leaves.slice(activeIndex + 1).find(node => !retired.has(keyOf(node)));
    const view = renderRunCard(container, {
      app: options.app, task: focus, session, path: activePath,
      redrawIntervalMs: options.redrawIntervalMs,
      progressLabel: `Leaf ${Math.max(1, (state.processedCount || 0) + 1)} of ${state.totalLeafCount || leaves.length}`,
      nextLabel: next ? `Next: ${core.taskPath(next, map).map(node => node.display).join(" → ")} (${core.formatDuration(next.estimateMs)})` : null,
      onStop: () => {
        Object.values(state.sessions || {}).forEach(value => settle(value));
        state.screen = "select"; state.focusKey = null; state.activeLeafKey = null;
        options.onStateChange?.(state); options.onStop?.(state);
        if (options.onRefresh) options.onRefresh(); else renderSession(container, options);
      },
      onFocus: node => {
        settle(session); state.focusKey = keyOf(node); options.onStateChange?.(state);
        if (options.onRefresh) options.onRefresh(); else renderRunner(container, options);
      },
      onStateChange: () => options.onStateChange?.(state),
      onPause: () => { if (session.startedAt == null) session.startedAt = Date.now(); else settle(session); },
      onSkip: advance,
      onDone: finish,
    });
    return { model: current, state, dispose: view.dispose };
  }

  function renderSession(container, options) {
    const core = requireCore();
    const state = options.state || createRunState();
    const current = model(options.content, options.rootLine, options.rootLine, options.defaultEstimateMs);
    const notify = () => options.onStateChange?.(state);
    if (!current) {
      container.empty?.();
      container.createDiv({ cls: "rr-embedded-error", text: "The linked root task is missing or is no longer a task. The saved routine was retained." });
      return { model: null, state, dispose() {} };
    }
    const all = core.flatten([current.root]);
    const map = new Map(all.map(node => [node.id, node]));
    const keyOf = node => core.taskPath(node, map).map(part => part.display).join("\u0000");
    const leaves = all.filter(node => !node.children.length && !node.checked);
    const validKeys = new Set(leaves.map(keyOf));
    state.source = options.sourcePath || state.source;
    state.rootBlockId = options.rootBlockId || state.rootBlockId;

    if (!state.screen || state.screen === "select") {
      state.screen = "select";
      state.selected = Array.isArray(state.selected) ? state.selected : [];
      state.order = Array.isArray(state.order) ? state.order : [];
      state.enabled = state.enabled && typeof state.enabled === "object" ? state.enabled : {};
      container.empty?.();
      if (!state.selectionInitialized) {
        const prior = new Set(state.selected);
        all.forEach(node => { state.enabled[keyOf(node)] = node.children.length || !prior.size || prior.has(keyOf(node)); });
        state.selectionInitialized = true;
      }
      state.selected = state.selected.filter(key => validKeys.has(key));
      const order = state.treeOrder?.length ? state.treeOrder : state.order;
      const orderIndex = new Map(order.map((key, index) => [key, index]));
      const sortTree = nodes => {
        nodes.sort((a, b) => (orderIndex.get(keyOf(a)) ?? Number.MAX_SAFE_INTEGER) - (orderIndex.get(keyOf(b)) ?? Number.MAX_SAFE_INTEGER));
        nodes.forEach(node => sortTree(node.children));
      };
      sortTree(current.root.children);
      current.root.selected = state.enabled[keyOf(current.root)] !== false;
      core.flatten(current.root.children).forEach(node => { node.selected = state.enabled[keyOf(node)] !== false; });
      const selectionTasks = [current.root];
      const syncSelection = () => {
        const ordered = core.flatten(selectionTasks);
        ordered.forEach(node => { state.enabled[keyOf(node)] = node.selected !== false; });
        state.treeOrder = ordered.map(keyOf);
        state.selected = enabledLeaves(selectionTasks).map(keyOf).filter(key => validKeys.has(key));
        state.order = core.flatten(selectionTasks).filter(node => !node.children.length).map(keyOf);
        notify();
      };
      syncSelection();
      const header = container.createDiv({ cls: "rr-selection-header" });
      const selectedCount = state.selected.length;
      const start = header.createEl("button", { cls: "rr-btn rr-btn-primary", text: selectedCount ? `Start routine (${selectedCount} leaf task${selectedCount === 1 ? "" : "s"})` : "Select at least one leaf task" });
      start.disabled = !selectedCount;
      start.addEventListener("click", () => {
        syncSelection();
        state.retired = leaves.filter(node => !state.selected.includes(keyOf(node))).map(keyOf);
        state.totalLeafCount = selectedCount;
        state.processedCount = 0; state.completedCount = 0; state.summary = null;
        state.screen = "run"; notify();
        if (options.onRefresh) options.onRefresh(); else renderSession(container, options);
      });
      renderSelection(container, {
        state,
        tasks: selectionTasks,
        render: () => renderSession(container, options),
        onChange: syncSelection,
        onReset: () => {
          core.flatten(selectionTasks).forEach(node => { node.selected = true; });
          state.enabled = {};
        },
      });
      return { model: current, state, dispose() {} };
    }

    if (state.screen === "summary" || !leaves.some(node => !new Set(state.retired).has(keyOf(node)))) {
      if (!state.summary) state.summary = { elapsedMs: sessionElapsedTotal(state), processedCount: state.processedCount || 0, completedCount: state.completedCount || 0, totalLeafCount: state.totalLeafCount || 0 };
      state.screen = "summary"; notify();
      container.empty?.();
      renderSummary(container, state.summary);
      options.onFinish?.(state.summary);
      return { model: current, state, dispose() {} };
    }
    return renderRunner(container, options);
  }

  return { model, replacementForTask, completeTask, configuredTaskStatuses, showStatusMenu, renderBreadcrumbs,
    createRunState, serializeSession, deserializeSession, sessionElapsedTotal, runningSession, enabledLeaves,
    renderSelection, renderRunCard, renderSummary, installStyles,
    lineForKey, renderRunner, renderSession };
});

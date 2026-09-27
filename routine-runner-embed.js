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
    const transformed = status === null && typeof api?.executeToggleTaskDoneCommand === "function"
      ? api.executeToggleTaskDoneCommand(rawLine, file.path)
      : null;
    let replacement = replacementForTask(rawLine, transformed, status);
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

  function render(container, options) {
    const current = model(options.content, options.rootLine, options.focusLine, options.defaultEstimateMs);
    container.empty?.();
    if (!current) {
      container.createDiv({ cls: "rr-embedded-error", text: "Referenced task no longer exists." });
      return { model: null };
    }
    const crumbs = container.createDiv({ cls: "rr-embedded-crumbs" });
    renderBreadcrumbs(crumbs, current.path, current.focus.line, options.onFocus);
    if (current.children.length) {
      const list = container.createDiv({ cls: "rr-embedded-children" });
      current.children.forEach(child => {
        const row = list.createDiv({ cls: `rr-embedded-child${child.checked ? " is-complete" : ""}` });
        const open = row.createEl("button", { cls: "rr-embedded-open", text: child.display });
        open.addEventListener("click", () => options.onFocus?.(child.line));
        const done = row.createEl("button", { text: child.checked ? "Done" : "Complete" });
        done.disabled = child.checked || child.children.some(descendant => !descendant.checked);
        done.addEventListener("click", () => options.onComplete?.(child.line));
      });
    } else {
      const row = container.createDiv({ cls: "rr-embedded-leaf" });
      row.createSpan({ text: current.focus.checked ? "Completed" : "Leaf task" });
      const done = row.createEl("button", { text: current.focus.checked ? "Done" : "Complete" });
      done.disabled = current.focus.checked;
      done.addEventListener("click", () => options.onComplete?.(current.focus.line));
    }
    container.createDiv({ cls: "rr-embedded-progress", text: `${current.complete} of ${current.total} tasks complete` });
    return { model: current };
  }

  function createRunState() {
    return { focusKey: null, activeLeafKey: null, retired: [], sessions: {} };
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
    const leaves = all.filter(node => !node.children.length && !node.checked && !retired.has(keyOf(node)));
    let activeLeaf = byKey.get(state.activeLeafKey);
    if (!activeLeaf || activeLeaf.checked || activeLeaf.children.length || retired.has(keyOf(activeLeaf))) activeLeaf = leaves[0] || null;
    if (!activeLeaf) {
      container.createDiv({ cls: "rr-embedded-done", text: "Routine complete 🎉" });
      return { model: current, dispose() {} };
    }
    state.activeLeafKey = keyOf(activeLeaf);
    let focus = byKey.get(state.focusKey);
    const activePath = core.taskPath(activeLeaf, map);
    if (!focus || !activePath.some(node => node.id === focus.id)) focus = activeLeaf;
    state.focusKey = keyOf(focus);

    const settle = (session, now = Date.now()) => {
      if (session?.startedAt != null) {
        session.elapsedBeforeStartMs += Math.max(0, now - session.startedAt);
        session.startedAt = null;
      }
    };
    const session = state.sessions[state.focusKey] || (state.sessions[state.focusKey] = {
      elapsedBeforeStartMs: 0, startedAt: Date.now(), count: 0,
    });
    const header = container.createDiv({ cls: "rr-embedded-header" });
    header.createSpan({ text: `Leaf ${Math.max(1, all.filter(node => !node.children.length).indexOf(activeLeaf) + 1)} of ${all.filter(node => !node.children.length).length}` });
    const crumbs = container.createDiv({ cls: "rr-task-text rr-embedded-crumbs" });
    renderBreadcrumbs(crumbs, activePath, focus.line, (line, node) => {
      settle(session);
      state.focusKey = keyOf(node);
      renderRunner(container, options);
    }, false);
    container.createDiv({ cls: "rr-est", text: `Estimated: ${core.formatDuration(focus.estimateMs)}` });

    if (focus.goalCount != null) {
      const countRow = container.createDiv({ cls: "rr-count-row" });
      const minus = countRow.createEl("button", { cls: "rr-btn rr-count-btn", text: "−" });
      const value = countRow.createSpan({ cls: "rr-count-value", text: String(session.count) });
      countRow.createSpan({ cls: "rr-count-sep", text: "/" });
      countRow.createSpan({ cls: "rr-count-goal", text: String(focus.goalCount) });
      const plus = countRow.createEl("button", { cls: "rr-btn rr-count-btn", text: "+" });
      const change = delta => { session.count = Math.max(0, session.count + delta); value.textContent = String(session.count); };
      minus.addEventListener("click", () => change(-1)); plus.addEventListener("click", () => change(1));
    }

    const timer = container.createDiv({ cls: "rr-timer", text: "0:00" });
    const bar = container.createDiv({ cls: "rr-bar" });
    const fill = bar.createDiv({ cls: "rr-bar-fill" });
    const repaint = () => {
      const elapsed = core.elapsedForSession(session);
      timer.textContent = core.formatDuration(elapsed);
      const percent = focus.estimateMs ? Math.min(100, elapsed / focus.estimateMs * 100) : 0;
      fill.style.width = `${percent}%`;
      timer.classList.toggle("rr-overdue", elapsed > focus.estimateMs);
      fill.classList.toggle("rr-overdue", elapsed > focus.estimateMs);
    };
    repaint();
    const interval = setInterval(repaint, options.redrawIntervalMs || 1000);
    const dispose = () => clearInterval(interval);

    const buttons = container.createDiv({ cls: "rr-btn-row" });
    const pause = buttons.createEl("button", { cls: "rr-btn", text: session.startedAt == null ? "Resume" : "Pause" });
    pause.addEventListener("click", () => {
      if (session.startedAt == null) session.startedAt = Date.now(); else settle(session);
      pause.textContent = session.startedAt == null ? "Resume" : "Pause"; repaint();
    });
    const advance = () => {
      settle(session);
      core.flatten([focus]).forEach(node => retired.add(keyOf(node)));
      state.retired = [...retired]; state.focusKey = null; state.activeLeafKey = null;
      dispose();
      if (options.onRefresh) options.onRefresh(); else renderRunner(container, options);
    };
    const skip = buttons.createEl("button", { cls: "rr-btn", text: "Skip" });
    skip.addEventListener("click", advance);
    const done = buttons.createEl("button", { cls: "rr-btn rr-btn-primary", text: "Done" });
    done.addEventListener("click", async () => {
      done.disabled = true; settle(session); dispose();
      try { await options.onComplete?.(focus.line, { elapsedMs: core.elapsedForSession(session), count: session.count, goalCount: focus.goalCount }); }
      catch (error) { done.disabled = false; throw error; }
    });
    const activeIndex = leaves.findIndex(node => node.id === activeLeaf.id);
    const next = leaves.slice(activeIndex + 1).find(node => !retired.has(keyOf(node)));
    container.createDiv({ cls: "rr-next", text: next ? `Next: ${core.taskPath(next, map).map(node => node.display).join(" → ")} (${core.formatDuration(next.estimateMs)})` : "This is the last remaining leaf task." });
    return { model: current, state, dispose };
  }

  return { model, replacementForTask, completeTask, renderBreadcrumbs, render, createRunState, renderRunner };
});

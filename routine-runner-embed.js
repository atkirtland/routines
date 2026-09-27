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
    return { focusKey: null, activeLeafKey: null, retired: [], sessions: {}, completedCount: 0, processedCount: 0 };
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
        session.elapsedBeforeStartMs += Math.max(0, now - session.startedAt);
        session.startedAt = null;
      }
    };
    const session = state.sessions[state.focusKey] || (state.sessions[state.focusKey] = {
      elapsedBeforeStartMs: 0, startedAt: Date.now(), count: 0,
    });
    options.onStateChange?.(state);
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
      value.addEventListener("click", () => {
        const input = document.createElement("input"); input.type = "number"; input.className = "rr-count-input"; input.value = String(session.count);
        value.replaceWith(input); input.focus(); input.select();
        const commit = () => { session.count = Math.max(0, Number.parseInt(input.value, 10) || 0); value.textContent = String(session.count); input.replaceWith(value); options.onStateChange?.(state); };
        input.addEventListener("blur", commit); input.addEventListener("keydown", event => { if (event.key === "Enter") input.blur(); });
      });
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
    let wakeLock = null, disposed = false;
    if (typeof navigator !== "undefined" && "wakeLock" in navigator) navigator.wakeLock.request("screen").then(lock => {
      if (disposed) lock.release().catch(() => {}); else wakeLock = lock;
    }).catch(() => {});
    const dispose = () => { disposed = true; clearInterval(interval); wakeLock?.release().catch(() => {}); wakeLock = null; };

    const buttons = container.createDiv({ cls: "rr-btn-row" });
    const pause = buttons.createEl("button", { cls: "rr-btn", text: session.startedAt == null ? "Resume" : "Pause" });
    pause.addEventListener("click", () => {
      if (session.startedAt == null) session.startedAt = Date.now(); else settle(session);
      pause.textContent = session.startedAt == null ? "Resume" : "Pause"; repaint();
      options.onStateChange?.(state);
    });
    const advance = () => {
      settle(session);
      core.flatten([focus]).forEach(node => retired.add(keyOf(node)));
      state.retired = [...retired]; state.focusKey = null; state.activeLeafKey = null;
      state.processedCount = (state.processedCount || 0) + 1; options.onStateChange?.(state);
      dispose();
      if (options.onRefresh) options.onRefresh(); else renderRunner(container, options);
    };
    const skip = buttons.createEl("button", { cls: "rr-btn", text: "Skip" });
    skip.addEventListener("click", advance);
    const done = buttons.createEl("button", { cls: "rr-btn rr-btn-primary", text: "Done" });
    const finish = async status => {
      done.disabled = true; settle(session); dispose();
      try {
        await options.onComplete?.(focus.line, { elapsedMs: core.elapsedForSession(session), count: session.count, goalCount: focus.goalCount }, status);
        state.completedCount = (state.completedCount || 0) + 1; state.processedCount = (state.processedCount || 0) + 1; options.onStateChange?.(state);
      }
      catch (error) { done.disabled = false; throw error; }
    };
    done.addEventListener("click", () => finish(null));
    done.title = "Right-click to choose a Tasks status";
    done.addEventListener("contextmenu", event => { event.preventDefault(); showStatusMenu(options.app, done, finish); });
    const activeIndex = leaves.findIndex(node => node.id === activeLeaf.id);
    const next = leaves.slice(activeIndex + 1).find(node => !retired.has(keyOf(node)));
    container.createDiv({ cls: "rr-next", text: next ? `Next: ${core.taskPath(next, map).map(node => node.display).join(" → ")} (${core.formatDuration(next.estimateMs)})` : "This is the last remaining leaf task." });
    return { model: current, state, dispose };
  }

  return { model, replacementForTask, completeTask, configuredTaskStatuses, showStatusMenu, renderBreadcrumbs, render, createRunState, lineForKey, renderRunner };
});

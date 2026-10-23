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

  let durationAudioContext = null;

  function audioContext() {
    if (durationAudioContext) return durationAudioContext;
    const AudioContext = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AudioContext) return null;
    try { durationAudioContext = new AudioContext(); } catch (_) { return null; }
    return durationAudioContext;
  }

  function primeDurationSound() {
    const context = audioContext();
    if (context?.state === "suspended") context.resume().catch(() => {});
  }

  function playDurationSound() {
    const context = audioContext();
    if (!context) return false;
    try {
      if (context.state === "suspended") context.resume().catch(() => {});
      const start = context.currentTime;
      const gain = context.createGain();
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.16, start + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.55);
      gain.connect(context.destination);
      [[659.25, 0], [880, 0.2]].forEach(([frequency, delay]) => {
        const oscillator = context.createOscillator();
        oscillator.type = "sine";
        oscillator.frequency.setValueAtTime(frequency, start + delay);
        oscillator.connect(gain);
        oscillator.start(start + delay);
        oscillator.stop(start + delay + 0.32);
      });
      return true;
    } catch (_) { return false; }
  }

  // Obsidian desktop runs this view in Electron's renderer, where the standard
  // Web Notification constructor is the supported system-notification path.
  // This is intentionally the same call that works in Obsidian's dev console:
  // new Notification(title, { body }). Most mobile WebViews do not expose it.
  function sendDesktopNotification(title, body) {
    const WebNotification = globalThis.Notification;
    const show = () => {
      try {
        const notification = new WebNotification(title, { body: body || "", silent: true });
        // Construction can succeed before the OS reports a delivery failure.
        notification.onerror = error => {
          console.warn("Routine Runner: Notification failed", error);
        };
        return true;
      }
      catch (error) { console.warn("Routine Runner: Notification failed", error); return false; }
    };
    if (typeof WebNotification !== "function" || WebNotification.permission === "denied") return false;
    if (WebNotification.permission === "granted") return show();
    // Some Electron versions expose the constructor without a meaningful
    // permission property. In that case, try the known-working constructor.
    if (WebNotification.permission == null) return show();
    Promise.resolve(WebNotification.requestPermission?.())
      .then(permission => { if (permission === "granted") show(); })
      .catch(error => console.warn("Routine Runner: notification permission failed", error));
    return true;
  }

  function notifyDurationEnd(task) {
    playDurationSound();
    const core = requireCore();
    sendDesktopNotification("Planned time reached", task ? `${task.display} (${core.formatDuration(task.estimateMs)})` : "");
  }

  function crossedPlannedDuration(previousElapsed, elapsed, estimateMs) {
    return Number(estimateMs) > 0 && previousElapsed < estimateMs && elapsed >= estimateMs;
  }

  const SHARED_STYLE_ID = "routine-runner-shared-style";
  const SHARED_CSS = `
    .rr-root,.rr-embedded{font-size:var(--font-text-size)}
    .rr-cache-tools{display:flex;justify-content:flex-end;margin-bottom:.5em}.rr-purge-btn{color:var(--text-muted)}.rr-purge-btn:hover{color:var(--color-red,#e5534b)}
    .rr-setup-tools{position:sticky;top:0;z-index:2;padding:.55em;margin-bottom:.6em;border:1px solid var(--background-modifier-border);border-radius:6px;background:var(--background-primary);box-shadow:0 2px 8px rgba(0,0,0,.12)}
    .rr-tools-row{display:flex;align-items:center;flex-wrap:wrap;gap:.4em}.rr-tools-row+.rr-tools-row{margin-top:.45em}.rr-tools-row .rr-input{flex:1 1 14em;width:auto;margin:0}
    .rr-input{width:100%;box-sizing:border-box;padding:6px 10px;border-radius:6px;border:1px solid var(--background-modifier-border);background:var(--background-primary);color:var(--text-normal);margin-bottom:.5em}
    .rr-tool-btn{padding:4px 8px;font-size:.82em;border-radius:5px;border:1px solid var(--background-modifier-border);background:var(--interactive-normal);color:var(--text-normal);cursor:pointer}.rr-tool-btn:hover{background:var(--interactive-hover)}.rr-reset-btn{margin-left:auto}
    .rr-summary{margin-left:auto;color:var(--text-muted);font-size:.85em;white-space:nowrap}
    .rr-review-list{display:grid;grid-template-columns:auto minmax(0,1fr) auto auto auto;align-items:stretch;column-gap:0;padding:0 10px;border:1px solid var(--background-modifier-border);border-radius:6px;margin-bottom:.75em}.rr-review-item{display:contents}.rr-review-item>*{padding:6px 0;border-bottom:1px solid var(--background-modifier-border);box-sizing:border-box}.rr-review-list>.rr-review-item:last-child>*{border-bottom:none}
    .rr-review-item-disabled>*{opacity:.45}.rr-review-item-disabled .rr-review-text{text-decoration:line-through}.rr-review-item-context .rr-review-label{color:var(--text-muted);font-style:italic}.rr-review-item-active>*{box-shadow:inset 0 2px 0 var(--interactive-accent),inset 0 -2px 0 var(--interactive-accent)}.rr-review-item-active>*:first-child{box-shadow:inset 2px 0 0 var(--interactive-accent),inset 0 2px 0 var(--interactive-accent),inset 0 -2px 0 var(--interactive-accent)}.rr-review-item-active>*:last-child{box-shadow:inset -2px 0 0 var(--interactive-accent),inset 0 2px 0 var(--interactive-accent),inset 0 -2px 0 var(--interactive-accent)}.rr-review-item-active .rr-review-label{color:var(--interactive-accent)}
    .rr-review-text{display:flex;align-items:center;min-width:0}.rr-review-label{min-width:0;overflow:hidden;text-overflow:ellipsis}.rr-disclosure{flex:none;width:1.4em;margin-left:.35em;padding:0;border:0;background:transparent;color:var(--text-muted);cursor:pointer}
    .rr-badge{color:var(--text-muted);font-size:.8em;background:var(--background-secondary);border-radius:4px;padding:1px 6px;white-space:nowrap}.rr-badge-button{border:1px solid transparent;font-family:inherit;line-height:inherit;cursor:pointer}.rr-badge-button:hover,.rr-badge-button:focus{color:var(--interactive-accent);border-color:var(--interactive-accent)}.rr-badge-group{display:flex;align-items:center;justify-content:flex-end;gap:.4em;padding-left:.6em}.rr-checkbox-cell,.rr-status-checkbox-cell{display:flex;align-items:center;justify-content:center;padding-left:.6em}.rr-status-checkbox-cell{padding-left:0;padding-right:.55em}.rr-reorder{display:flex;align-items:center;justify-content:center;gap:2px;padding-left:.6em}.rr-reorder-btn{line-height:1;font-size:.7em;padding:2px 6px;border-radius:4px;border:1px solid var(--background-modifier-border);background:var(--interactive-normal);color:var(--text-normal);cursor:pointer}.rr-reorder-btn:hover:not(:disabled){background:var(--interactive-hover)}.rr-reorder-btn:disabled{opacity:.3;cursor:default}
    .rr-empty{color:var(--text-muted);padding:8px 0}.rr-selection-header{display:flex;align-items:center;gap:.75em;margin-bottom:.6em}
    .rr-header{display:flex;align-items:center;justify-content:space-between;gap:.75em;margin-bottom:.5em}.rr-card{border:1px solid var(--background-modifier-border);border-radius:8px;padding:1em;background:var(--background-secondary)}
    .rr-task-text{font-size:1.15em;font-weight:600;margin-bottom:.25em}.rr-embedded-crumbs{display:flex;align-items:center;gap:.15em;flex-wrap:wrap}.rr-crumb{cursor:pointer;color:var(--interactive-accent)}.rr-crumb-current{cursor:default;color:var(--text-normal)}.rr-crumb-sep{color:var(--text-faint);padding:0 .35em}.rr-est{color:var(--text-muted);font-size:.85em;margin-bottom:.75em}
    .rr-timer-row{text-align:center}.rr-timer{font-size:2.2em;font-weight:700;font-variant-numeric:tabular-nums;color:var(--text-normal)}.rr-timer.rr-overdue{color:var(--color-red,#e5534b)}.rr-bar{height:10px;border-radius:5px;background:var(--background-modifier-border);overflow:hidden;margin:.75em 0 1em}.rr-bar-fill{height:100%;width:0;background:var(--color-green,#4caf50);transition:width .2s linear,background-color .2s linear}.rr-bar-fill.rr-overdue{background:var(--color-red,#e5534b)}
    .rr-count-row{display:flex;align-items:center;justify-content:center;gap:.6em;margin:.75em 0 1em}.rr-count-btn{flex:none;width:2.4em;font-size:1.2em;padding:6px 0}.rr-count-value{font-size:1.8em;font-weight:700;min-width:1.4em;text-align:center;cursor:pointer;border-bottom:1px dashed var(--text-faint)}.rr-count-value:hover{color:var(--interactive-accent)}.rr-count-sep{color:var(--text-muted);font-size:1.4em}.rr-count-goal{color:var(--text-muted);font-size:1.4em;font-weight:600}.rr-count-input{font-size:1.8em;font-weight:700;width:3.2em;text-align:center;border-radius:4px;border:1px solid var(--background-modifier-border);background:var(--background-primary);color:var(--text-normal)}
    .rr-btn-row{display:flex;gap:.5em}.rr-btn{flex:1;padding:8px;border-radius:6px;border:1px solid var(--background-modifier-border);background:var(--interactive-normal);color:var(--text-normal);cursor:pointer}.rr-btn:hover{background:var(--interactive-hover)}.rr-btn:disabled{opacity:.5;cursor:default}.rr-btn-primary{background:var(--interactive-accent);color:var(--text-on-accent);border-color:var(--interactive-accent)}.rr-btn-primary:hover{background:var(--interactive-accent-hover)}.rr-btn-stop{flex:none;padding:4px 14px;font-size:.85em;border-radius:6px;border:1px solid var(--background-modifier-border);background:var(--interactive-normal);color:var(--text-normal);cursor:pointer}.rr-btn-stop:hover{background:var(--interactive-hover)}.rr-progress-label{font-weight:600}
    .rr-run-tree{margin-top:.75em}.rr-run-tree .rr-review-list{max-height:12em;overflow-y:auto;overscroll-behavior:contain;background:var(--background-primary)}.rr-review-item-current>*{background:var(--background-modifier-hover);font-weight:600}.rr-review-item-processed>*{opacity:.55}.rr-review-item-processed .rr-review-label{text-decoration:line-through}.rr-undo-btn{white-space:nowrap}.rr-review-item-processed>.rr-reorder{opacity:1}.rr-review-item-locked input{cursor:not-allowed}
    .rr-add-task{display:flex;gap:.4em;margin:.45em 0 .75em}.rr-add-task .rr-input{margin:0;flex:1}.rr-add-task .rr-tool-btn{white-space:nowrap}
    .rr-status-menu{position:fixed;z-index:var(--layer-menu,1000);min-width:190px;max-height:60vh;overflow:auto;padding:4px;border:1px solid var(--background-modifier-border);border-radius:6px;background:var(--background-primary);box-shadow:var(--shadow-s)}.rr-status-option{display:flex;width:100%;gap:.6em;align-items:center;padding:6px 9px;border:0;border-radius:4px;background:transparent;color:var(--text-normal);text-align:left;cursor:pointer}.rr-status-option:hover,.rr-status-option:focus{background:var(--background-modifier-hover)}.rr-status-symbol{min-width:2.2em;font-family:var(--font-monospace)}.rr-status-type{margin-left:auto;color:var(--text-muted);font-size:.8em}
  `;

  function installStyles(doc = document) {
    const stale = doc.getElementById("routine-runner-shared-selection-style");
    if (stale) stale.remove();
    let style = doc.getElementById(SHARED_STYLE_ID);
    if (!style) {
      style = doc.createElement("style");
      style.id = SHARED_STYLE_ID;
      doc.head.appendChild(style);
    }
    style.textContent = SHARED_CSS;
    // Web Audio must be resumed synchronously from a user gesture. Listening at
    // document level lets the click (or key press) that starts an async runner
    // unlock the context before the task card is rendered.
    if (!doc.__routineRunnerDurationSoundUnlock && typeof doc.addEventListener === "function") {
      doc.__routineRunnerDurationSoundUnlock = true;
      doc.addEventListener("pointerdown", primeDurationSound, true);
      doc.addEventListener("keydown", primeDurationSound, true);
    }
  }

  function model(content, rootLine, focusLine = rootLine, defaultEstimateMs) {
    const core = requireCore();
    const parsed = core.parseRoutineText(content, defaultEstimateMs);
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
      leaves: core.flatten([sourceRoot]).filter(node => core.isRunnableLeaf(node) && !node.checked),
      hasIncompleteDescendants: descendants.some(node => node.checkable !== false && !node.checked),
      complete: core.flatten([sourceRoot]).filter(node => node.checkable !== false && node.checked).length,
      total: core.flatten([sourceRoot]).filter(node => node.checkable !== false).length,
    };
  }

  function multiRootModel(content, rootLines, defaultEstimateMs) {
    const core = requireCore();
    const parsed = core.parseRoutineText(content, defaultEstimateMs);
    const roots = [...new Set(rootLines || [])].map(line => core.taskAtLine(parsed, line)).filter(Boolean);
    if (!roots.length) return null;
    if (roots.length === 1) return model(content, roots[0].line, roots[0].line, defaultEstimateMs);
    const root = { id: "__linked_roots__", parentId: null, line: -1, raw: "", display: "Linked tasks", checkable: false, checked: false, selected: true, children: roots };
    roots.forEach(task => { task.parentId = root.id; });
    const all = core.flatten([root]), descendants = core.flatten(root.children);
    return {
      root, focus: root, path: [root], children: root.children,
      leaves: all.filter(node => core.isRunnableLeaf(node) && !node.checked),
      hasIncompleteDescendants: descendants.some(node => node.checkable !== false && !node.checked),
      complete: all.filter(node => node.checkable !== false && node.checked).length,
      total: all.filter(node => node.checkable !== false).length,
    };
  }

  const sessionModel = options => options.rootLines?.length
    ? multiRootModel(options.content, options.rootLines, options.defaultEstimateMs)
    : model(options.content, options.rootLine, options.rootLine, options.defaultEstimateMs);

  function replacementForTask(rawLine, replacementFromTasksPlugin = null, status = null) {
    const core = requireCore();
    if (!rawLine?.match(core.TASK_LINE_RE)) throw new Error("Referenced line is no longer a task");
    if (replacementFromTasksPlugin && status === null) return replacementFromTasksPlugin;
    const symbol = status?.symbol ?? "x";
    return rawLine.replace(core.TASK_LINE_RE, (m, p1, p2, p3, p4) => `${p1}${symbol}${p3}${p4}`);
  }

  function localLifecycleParts(instant = new Date()) {
    const pad = value => String(value).padStart(2, "0");
    const offsetMinutes = -instant.getTimezoneOffset();
    const offset = offsetMinutes === 0 ? "Z"
      : `${offsetMinutes < 0 ? "-" : "+"}${pad(Math.floor(Math.abs(offsetMinutes) / 60))}:${pad(Math.abs(offsetMinutes) % 60)}`;
    return {
      date: `${instant.getFullYear()}-${pad(instant.getMonth() + 1)}-${pad(instant.getDate())}`,
      time: `${pad(instant.getHours())}:${pad(instant.getMinutes())}:${pad(instant.getSeconds())}${offset}`,
    };
  }

  function stampLifecycleTime(line, type, time) {
    const dateEmoji = type === "DONE" ? "✅" : type === "CANCELLED" ? "❌" : null;
    const withoutStale = String(line).replace(/\s*🕐\uFE0F?\s*\d{2}:\d{2}:\d{2}(?:Z|[+-]\d{2}:\d{2})/gu, "");
    if (!dateEmoji || !new RegExp(`${dateEmoji}\\uFE0F?\\s*\\d{4}-\\d{2}-\\d{2}`, "u").test(withoutStale)) return withoutStale;
    return requireCore().insertBeforeTasksMetadata(withoutStale, `🕐 ${time}`);
  }

  async function completeTaskTransaction(app, file, content, line, status = null, result = null, instant = new Date()) {
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
      const { date } = localLifecycleParts(instant);
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
    const lifecycleType = status?.type || "DONE";
    const { time } = localLifecycleParts(instant);
    replacement = replacement.split("\n").map(value => stampLifecycleTime(value, lifecycleType, time)).join("\n");
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
    return { content: next, undo: { start: line, beforeLines: [rawLine], afterLines: replacement.split("\n") } };
  }

  async function completeTask(app, file, content, line, status = null, result = null) {
    return (await completeTaskTransaction(app, file, content, line, status, result)).content;
  }

  function undoReplacements(content, tokens) {
    let lines = String(content).split(/\r?\n/);
    for (const token of [...tokens].reverse()) {
      const after = token?.afterLines || [], before = token?.beforeLines || [];
      const matches = [];
      for (let i = 0; i <= lines.length - after.length; i++) {
        if (after.every((value, offset) => lines[i + offset] === value)) matches.push(i);
      }
      if (matches.length !== 1) return { ok: false, reason: matches.length ? "completed text is ambiguous" : "completed text was edited" };
      let at = Number(token?.start);
      if (!Number.isInteger(at) || !after.every((value, offset) => lines[at + offset] === value)) {
        at = matches[0];
      }
      lines.splice(at, after.length, ...before);
    }
    return { ok: true, content: lines.join("\n") };
  }

  async function undoCompletionTransactions(app, file, content, tokens) {
    const result = undoReplacements(content, tokens);
    if (!result.ok) throw new Error(`Could not rewind: ${result.reason}. No changes were made.`);
    await app.vault.modify(file, result.content);
    return result.content;
  }

  async function saveTaskComment(app, file, task, comment) {
    const content = await app.vault.read(file);
    const lines = content.split("\n");
    let line = task.line;
    if (lines[line] !== task.sourceLine) {
      const matches = lines.flatMap((value, index) => value === task.sourceLine ? [index] : []);
      if (matches.length !== 1) throw new Error("Task changed or is ambiguous. Reload the routine before saving a comment.");
      line = matches[0];
    }
    const replacement = requireCore().withTaskComment(lines[line], comment);
    lines[line] = replacement;
    await app.vault.modify(file, lines.join("\n"));
    return { line, sourceLine: replacement, comment: requireCore().taskCommentParts(replacement.match(requireCore().TASK_LINE_RE)[4]).comment };
  }

  function locateTask(content, task) {
    const core = requireCore(), parsed = core.parseRoutineText(content);
    let found = parsed.tasks.find(node => node.line === task.line && node.sourceLine === task.sourceLine);
    if (found) return { parsed, task: found };
    const matches = parsed.tasks.filter(node => node.sourceLine === task.sourceLine);
    if (matches.length !== 1) throw new Error(matches.length ? "Task is ambiguous; reload before editing the tree." : "Task changed; reload before editing the tree.");
    return { parsed, task: matches[0] };
  }

  function subtreeEnd(tasks, task, lines) {
    const next = tasks.find(node => node.line > task.line && node.indent <= task.indent);
    let end = next ? next.line : lines.length;
    for (let index = task.line + 1; index < end; index++) {
      if (/^#{1,6}\s/.test(lines[index])) { end = index; break; }
      if (lines[index].trim() && !lines[index].match(requireCore().TASK_LINE_RE)) {
        const indent = (lines[index].match(/^[ \t]*/) || [""])[0].replace(/\t/g, "    ").length;
        if (indent <= task.indent) { end = index > task.line + 1 && !lines[index - 1].trim() ? index - 1 : index; break; }
      }
    }
    return end;
  }

  async function moveTask(app, file, task, delta) {
    const content = await app.vault.read(file), lines = content.split(/\r?\n/);
    const { parsed, task: source } = locateTask(content, task);
    const siblings = parsed.tasks.filter(node => node.parentId === source.parentId);
    const index = siblings.findIndex(node => node.id === source.id), targetIndex = index + delta;
    if (index < 0 || targetIndex < 0 || targetIndex >= siblings.length) throw new Error("Task cannot move in that direction.");
    const first = delta < 0 ? siblings[targetIndex] : source;
    const second = delta < 0 ? source : siblings[targetIndex];
    const firstEnd = subtreeEnd(parsed.tasks, first, lines);
    const secondEnd = subtreeEnd(parsed.tasks, second, lines);
    if (firstEnd !== second.line) throw new Error("Only adjacent sibling task blocks can be moved safely.");
    lines.splice(first.line, secondEnd - first.line,
      ...lines.slice(second.line, secondEnd), ...lines.slice(first.line, firstEnd));
    const next = lines.join("\n");
    await app.vault.modify(file, next);
    const offset = delta < 0 ? first.line - source.line : secondEnd - second.line;
    requireCore().flatten([task]).forEach(node => { node.line += offset; });
    return next;
  }

  async function addTaskAfter(app, file, task, description, forceChild = false) {
    const name = String(description).replace(/[\r\n]+/g, " ").trim();
    if (!name) throw new Error("Enter a task description.");
    const content = await app.vault.read(file), lines = content.split(/\r?\n/);
    const { parsed, task: source } = locateTask(content, task);
    const asChild = forceChild;
    const indent = asChild ? source.indent + 2 : source.indent;
    const insertion = subtreeEnd(parsed.tasks, source, lines);
    const raw = `${" ".repeat(indent)}- [ ] ${name}`;
    lines.splice(insertion, 0, raw);
    const next = lines.join("\n");
    await app.vault.modify(file, next);
    const added = requireCore().parseRoutineText(next).tasks.find(node => node.line === insertion);
    return { content: next, task: added };
  }

  async function updateTaskEstimate(app, file, task, estimateMs) {
    const content = await app.vault.read(file), lines = content.split(/\r?\n/);
    const { task: source } = locateTask(content, task), core = requireCore();
    const match = lines[source.line].match(core.TASK_LINE_RE);
    if (!match) throw new Error("Referenced line is no longer a task.");
    const duration = core.formatDuration(Math.max(0, estimateMs));
    const description = core.TIME_GOAL_RE.test(match[4])
      ? match[4].replace(core.TIME_GOAL_RE, `⏱️ ${duration}`)
      : core.insertBeforeTasksMetadata(match[4], `⏱️ ${duration}`);
    lines[source.line] = `${match[1]}${match[2]}${match[3]}${description}`;
    const next = lines.join("\n");
    await app.vault.modify(file, next);
    return { content: next, line: source.line, sourceLine: lines[source.line], estimateMs: Math.max(0, estimateMs) };
  }

  async function checkTask(app, file, task, status = null, instant = new Date()) {
    const content = await app.vault.read(file);
    const { task: source } = locateTask(content, task);
    // A tree checkbox is a direct status edit, not a recurrence command, but
    // terminal statuses still use the same configured date/time handling as Done.
    const selectedStatus = status || { symbol: "x", name: "Done", type: "DONE" };
    const transaction = await completeTaskTransaction(app, file, content, source.line, selectedStatus, null, instant);
    return { content: transaction.content, line: source.line, sourceLine: transaction.undo.afterLines[0],
      checked: selectedStatus.symbol !== " ", undo: transaction.undo };
  }

  async function deleteTask(app, file, task) {
    const content = await app.vault.read(file), lines = content.split(/\r?\n/);
    const { parsed, task: source } = locateTask(content, task);
    const end = subtreeEnd(parsed.tasks, source, lines);
    lines.splice(source.line, end - source.line);
    const next = lines.join("\n");
    await app.vault.modify(file, next);
    return { content: next, start: source.line, count: end - source.line };
  }

  function durationPicker(initialMs) {
    return new Promise(resolve => {
      let settled = false;
      const modal = document.createElement("dialog");
      modal.createEl("h3", { text: "Estimated duration" });
      const input = modal.createEl("input", { attr: { type: "time", step: "1", "aria-label": "Estimated duration" } });
      const seconds = Math.max(0, Math.round(Number(initialMs) / 1000));
      input.value = `${String(Math.floor(seconds / 3600)).padStart(2, "0")}:${String(Math.floor(seconds / 60) % 60).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
      input.style.width = "100%";
      const row = modal.createDiv({ cls: "rr-tools-row" });
      const finish = value => { if (settled) return; settled = true; resolve(value); modal.close(); modal.remove(); };
      const cancel = row.createEl("button", { cls: "rr-tool-btn", text: "Cancel" });
      const save = row.createEl("button", { cls: "rr-tool-btn", text: "Save" });
      cancel.addEventListener("click", () => finish(null));
      save.addEventListener("click", () => {
        const parts = input.value.split(":").map(Number);
        finish(parts.length >= 2 && parts.every(Number.isFinite) ? ((parts[0] * 60 + parts[1]) * 60 + (parts[2] || 0)) * 1000 : null);
      });
      input.addEventListener("keydown", event => { if (event.key === "Enter") { event.preventDefault(); save.click(); } });
      modal.addEventListener("cancel", event => { event.preventDefault(); finish(null); });
      document.body.appendChild(modal); modal.showModal(); input.focus();
    });
  }

  function showTaskEditMenu(anchor, node, options) {
    const menu = document.body.createDiv({ cls: "rr-status-menu" });
    const item = (label, action, disabled = false) => {
      const button = menu.createEl("button", { cls: "rr-status-option", text: label });
      button.disabled = disabled;
      button.addEventListener("click", () => { menu.remove(); action(); });
    };
    if (options.onEstimate) item("Edit estimated time…", async () => {
      const value = await durationPicker(node.estimateMs);
      if (value != null) options.onEstimate(value);
    });
    item(node.children.length ? "Delete task and children…" : "Delete task…", options.onDelete, options.deleteDisabled);
    const rect = anchor.getBoundingClientRect(), box = menu.getBoundingClientRect();
    menu.style.left = `${Math.max(4, Math.min(rect.left, innerWidth - box.width - 4))}px`;
    menu.style.top = `${Math.max(4, Math.min(rect.bottom + 4, innerHeight - box.height - 4))}px`;
    menu.tabIndex = -1; menu.focus();
    menu.addEventListener("keydown", event => { if (event.key === "Escape") menu.remove(); });
    menu.addEventListener("focusout", () => setTimeout(() => { if (!menu.contains(document.activeElement)) menu.remove(); }, 0));
  }

  function renderBreadcrumbs(container, path, currentLine, onFocus, buttonMode = true, onContext = null) {
    path.forEach((node, index) => {
      if (index) container.createSpan({ cls: "rr-crumb-sep", text: "→" });
      const current = node.line === currentLine;
      const actionable = buttonMode && node.checkable !== false;
      const crumb = actionable
        ? container.createEl("button", { cls: "rr-embedded-crumb", text: node.display })
        : container.createSpan({ cls: current ? "rr-crumb rr-crumb-current" : "rr-crumb", text: node.display });
      if (actionable) crumb.disabled = current;
      if (actionable && !current) crumb.addEventListener("click", () => onFocus?.(node.line, node));
      if (onContext && node.checkable !== false) {
        crumb.title = "Right-click to edit this task's comment";
        crumb.addEventListener("contextmenu", event => { event.preventDefault(); event.stopPropagation(); onContext(crumb, node); });
      }
    });
  }

  function renderPurgeCacheButton(container, options = {}) {
    const button = container.createEl("button", { cls: "rr-tool-btn rr-purge-btn", text: options.label || "Purge cache" });
    button.addEventListener("click", async () => {
      button.disabled = true;
      try { await options.onPurge?.(); }
      catch (error) { button.disabled = false; throw error; }
    });
    return button;
  }


  function createRunState() {
    return { focusKey: null, activeLeafKey: null, retired: [], sessions: {}, completedCount: 0, processedCount: 0, runTree: [], initialRunTree: [], actionHistory: [] };
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
    state.runTree = Array.isArray(state.runTree) ? state.runTree : [];
    state.initialRunTree = Array.isArray(state.initialRunTree) ? state.initialRunTree : [];
    state.actionHistory = Array.isArray(state.actionHistory) ? state.actionHistory : [];
    // Keys are display paths. Re-normalize any saved under older display rules
    // (which kept metadata such as ➕/🏁/✅) so sessions and history still match.
    const norm = key => key == null ? key : requireCore().normalizeTaskKey(key);
    const sessions = {};
    Object.entries(state.sessions).forEach(([key, session]) => {
      const existing = sessions[norm(key)];
      if (!existing || session.elapsedBeforeStartMs > existing.elapsedBeforeStartMs) sessions[norm(key)] = session;
    });
    state.sessions = sessions;
    ["retired", "selected", "order"].forEach(field => { state[field] = [...new Set(state[field].map(norm))]; });
    if (Array.isArray(state.treeOrder)) state.treeOrder = [...new Set(state.treeOrder.map(norm))];
    if (state.enabled && typeof state.enabled === "object") state.enabled = Object.fromEntries(Object.entries(state.enabled).map(([key, value]) => [norm(key), value]));
    state.focusKey = norm(state.focusKey); state.activeLeafKey = norm(state.activeLeafKey);
    state.actionHistory.forEach(action => { action.key = norm(action.key); action.retiredKeys = (action.retiredKeys || []).map(norm); });
    const normalizeTree = node => {
      node.display = requireCore().taskDisplay(node.display);
      if (node._runKey != null) node._runKey = norm(node._runKey);
      (node.children || []).forEach(normalizeTree);
    };
    state.runTree.forEach(normalizeTree); state.initialRunTree.forEach(normalizeTree);
    if (!state.screen) state.screen = state.activeLeafKey || Object.keys(state.sessions).length ? "run" : "select";
    state.schemaVersion = 2;
    return state;
  }

  function sessionElapsedTotal(state, now = Date.now()) {
    return Object.values(state?.sessions || {}).reduce((sum, session) => sum + requireCore().elapsedForSession(session, now), 0);
  }

  function setRunnerMode(timing, mode, now = Date.now(), unassignedKey = timing.unassignedKey) {
    if (timing.since != null && (timing.mode === "task" || timing.mode === "unassigned")) {
      const field = timing.mode === "task" ? "taskMs" : "unassignedMs";
      const elapsed = Math.max(0, now - timing.since);
      timing[field] = (timing[field] || 0) + elapsed;
      if (timing.mode === "unassigned" && timing.unassignedKey) {
        timing.unassignedByTask = timing.unassignedByTask || {};
        timing.unassignedByTask[timing.unassignedKey] = (timing.unassignedByTask[timing.unassignedKey] || 0) + elapsed;
      }
    }
    timing.mode = mode;
    timing.since = now;
    if (mode === "unassigned") timing.unassignedKey = unassignedKey;
  }

  function runnerTotals(timing, now = Date.now()) {
    const snapshot = { ...timing, unassignedByTask: { ...(timing.unassignedByTask || {}) } };
    setRunnerMode(snapshot, snapshot.mode, now);
    return { elapsedMs: (snapshot.taskMs || 0) + (snapshot.unassignedMs || 0), unassignedMs: snapshot.unassignedMs || 0 };
  }

  function subtreeElapsedTotal(state, node, keyOf, now = Date.now()) {
    const keys = new Set(requireCore().flatten([node]).map(keyOf));
    const taskMs = [...keys].reduce((sum, key) => sum + requireCore().elapsedForSession(state.sessions?.[key], now), 0);
    const timing = { ...(state.timing || {}), unassignedByTask: { ...(state.timing?.unassignedByTask || {}) } };
    if (timing.mode === "unassigned") setRunnerMode(timing, "unassigned", now);
    const unassignedMs = [...keys].reduce((sum, key) => sum + (timing.unassignedByTask?.[key] || 0), 0);
    return taskMs + unassignedMs;
  }

  function toggleRunnerPause(timing, session, now = Date.now()) {
    if (timing.mode === "break") {
      if (timing.resumeTask) session.startedAt = now;
      setRunnerMode(timing, timing.resumeTask ? "task" : "unassigned", now);
    } else {
      timing.resumeTask = session.startedAt != null;
      if (timing.resumeTask) {
        session.elapsedBeforeStartMs = (session.elapsedBeforeStartMs || 0) + Math.max(0, now - session.startedAt);
        session.startedAt = null;
      }
      setRunnerMode(timing, "break", now);
    }
  }

  function runningSession(state) {
    return state?.screen === "run" && Object.values(state.sessions || {}).some(session => session?.startedAt != null);
  }

  function enabledLeaves(tasks) {
    const leaves = [];
    function visit(node, ancestorsEnabled) {
      const enabled = ancestorsEnabled && node.selected !== false;
      if (requireCore().isRunnableLeaf(node)) {
        if (enabled) leaves.push(node);
        return;
      }
      node.children.forEach(child => visit(child, enabled));
    }
    tasks.forEach(node => visit(node, true));
    return leaves;
  }

  // Display paths are readable and survive Tasks metadata changes, but the
  // display alone is not an identity: routines commonly repeat labels such as
  // "work" and "break". Disambiguate only same-named siblings so existing
  // keys for uniquely named tasks remain compatible.
  function taskKey(node, map) {
    const core = requireCore();
    return core.taskPath(node, map).map(part => {
      const siblings = part.parentId ? (map.get(part.parentId)?.children || [])
        : [...map.values()].filter(candidate => !candidate.parentId);
      const matches = siblings.filter(candidate => candidate.display === part.display);
      if (matches.length < 2) return part.display;
      return `${part.display}\u001f${matches.findIndex(candidate => candidate.id === part.id) + 1}`;
    }).join("\u0000");
  }

  // Standalone supplies an open-task tree to the shared selector. Scheduled
  // roots need the same pruning before they reach that selector.
  function openSelectionTree(node) {
    if (!node || (node.checkable !== false && node.checked)) return null;
    const children = node.children.map(openSelectionTree).filter(Boolean);
    if (node.checkable === false && !children.length) return null;
    if (node.children.length && !children.length) return null;
    return { ...node, children };
  }

  // The setup tree is deliberately host-agnostic. Standalone supplies the
  // selected note/section tree; Schedule Runner supplies the linked root tree.
  // Both therefore get the same hierarchy, controls, and keyboard behavior.
  function renderSelection(container, options) {
    const core = requireCore();
    const state = options.state;
    const tasks = options.tasks || [];
    const keyOf = options.keyOf || (node => node.id);
    const processed = new Set(options.processed || []);
    const currentKey = options.currentKey || null;
    const locked = node => processed.has(keyOf(node)) || keyOf(node) === currentKey || Boolean(options.locked?.(node));
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
    const selectionNodes = () => (state.taskQuery.trim() ? matchingNodes() : core.flatten(tasks)).filter(node => node.checkable !== false && !locked(node));
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
    list.setAttribute("aria-label", "Task tree; use Vim keys j/k, h/l, x, Shift-J/Shift-K, gg/G, u (undo), and slash");
    const rows = visibleRows();
    if (!rows.some(row => row.node.id === state.setupCursorId)) state.setupCursorId = rows[0]?.node.id ?? null;
    if (!rows.length) { list.createDiv({ cls: "rr-empty", text: "No matching tasks." }); return; }
    rows.forEach(({ node, siblings, idx, depth, ancestorsEnabled, effectiveHere, selfMatches }) => {
      const row = list.createDiv({ cls: "rr-review-item" });
      const nodeKey = keyOf(node), isProcessed = processed.has(nodeKey), isCurrent = nodeKey === currentKey;
      if (!effectiveHere) row.addClass("rr-review-item-disabled");
      if (isProcessed) row.addClass("rr-review-item-processed");
      if (isCurrent) row.addClass("rr-review-item-current");
      if (locked(node)) row.addClass("rr-review-item-locked");
      if (state.taskQuery.trim() && !selfMatches) row.addClass("rr-review-item-context");
      if (node.id === state.setupCursorId) row.addClass("rr-review-item-active");
      const statusCell = row.createDiv({ cls: "rr-status-checkbox-cell" });
      const statusCheckbox = node.checkable === false ? null : statusCell.createEl("input", { attr: { type: "checkbox", title: node.checked ? "Task already has a status" : "Mark task done", "aria-label": `${node.checked ? "Completed" : "Mark done"}: ${node.display}` } });
      if (statusCheckbox) statusCheckbox.style.transform = `translateX(${depth * 1.25}em)`;
      if (statusCheckbox) statusCheckbox.checked = Boolean(node.checked);
      if (statusCheckbox) statusCheckbox.disabled = Boolean(node.checked) || locked(node) || !options.onCheck;
      const markStatus = async status => {
        statusCheckbox.disabled = true;
        try {
          const updated = await options.onCheck(node, status);
          Object.assign(node, updated || { checked: true });
          redraw();
        } catch (error) { statusCheckbox.checked = false; statusCheckbox.disabled = false; options.onEditError?.(error); }
      };
      statusCheckbox?.addEventListener("change", () => { if (statusCheckbox.checked) markStatus(null); });
      statusCheckbox?.addEventListener("contextmenu", event => {
        if (locked(node) || !options.onCheck) return;
        event.preventDefault(); event.stopPropagation();
        showStatusMenu(options.app, statusCheckbox, markStatus).catch(error => options.onEditError?.(error));
      });
      const text = row.createSpan({ cls: "rr-review-text" });
      text.style.paddingLeft = `${depth * 1.25}em`;
      text.createSpan({ cls: "rr-review-label", text: node.display });
      if (node.children.length) {
        const disclosure = text.createEl("button", { cls: "rr-disclosure", text: state.collapsedIds.includes(node.id) && !state.taskQuery ? "▸" : "▾", attr: { "aria-label": state.collapsedIds.includes(node.id) ? "Expand branch" : "Collapse branch" } });
        disclosure.addEventListener("click", event => { event.stopPropagation(); state.collapsedIds = state.collapsedIds.includes(node.id) ? state.collapsedIds.filter(id => id !== node.id) : [...state.collapsedIds, node.id]; redraw(); });
      }
      text.addEventListener("click", () => {
        state.setupCursorId = node.id; redraw(); if (typeof requestAnimationFrame === "function") requestAnimationFrame(() => container.querySelector(".rr-review-list")?.focus());
      });
      const editEstimate = async () => {
        const value = await durationPicker(node.estimateMs);
        if (value == null) return;
        try {
          const updated = await options.onEstimate?.(node, value);
          if (updated) Object.assign(node, updated);
          redraw();
        } catch (error) { options.onEditError?.(error); }
      };
      if ((node.checkable !== false && options.onEstimate) || options.onDelete) text.addEventListener("contextmenu", event => {
        event.preventDefault(); event.stopPropagation();
        showTaskEditMenu(text, node, {
          deleteDisabled: locked(node) || !options.onDelete,
          onEstimate: node.checkable === false ? null : async value => {
            try { const updated = await options.onEstimate?.(node, value); if (updated) Object.assign(node, updated); redraw(); }
            catch (error) { options.onEditError?.(error); }
          },
          onDelete: async () => {
            const label = node.children.length ? `Delete “${node.display}” and all of its child tasks?` : `Delete “${node.display}”?`;
            if (typeof confirm === "function" && !confirm(label)) return;
            try {
              await options.onDelete?.(node);
              siblings.splice(idx, 1);
              if (state.setupCursorId === node.id) state.setupCursorId = siblings[Math.min(idx, siblings.length - 1)]?.id || null;
              redraw();
            } catch (error) { options.onEditError?.(error); }
          },
        });
      });
      const badges = row.createDiv({ cls: "rr-badge-group" });
      if (node.checkable !== false && node.goalCount != null) badges.createSpan({ cls: "rr-badge", text: `🎯 ${node.goalCount}` });
      const estimate = node.checkable === false ? null : options.onEstimate
        ? badges.createEl("button", { cls: "rr-badge rr-badge-button", text: core.formatDuration(node.estimateMs), attr: { title: "Edit estimated time", "aria-label": `Edit estimated time for ${node.display}` } })
        : badges.createSpan({ cls: "rr-badge", text: core.formatDuration(node.estimateMs) });
      if (estimate && options.onEstimate) estimate.addEventListener("click", event => { event.stopPropagation(); editEstimate(); });
      const checkboxCell = row.createDiv({ cls: "rr-checkbox-cell" });
      const checkbox = node.checkable === false ? null : checkboxCell.createEl("input", { attr: { type: "checkbox" } });
      if (checkbox) checkbox.checked = node.selected !== false;
      if (checkbox) checkbox.disabled = !ancestorsEnabled || locked(node);
      checkbox?.addEventListener("change", () => { core.setTaskSelected(node, checkbox.checked); redraw(); });
      const reorder = row.createDiv({ cls: "rr-reorder" });
      const rewindTitle = isProcessed ? options.rewindTitle?.(node, nodeKey) : null;
      if (rewindTitle) {
        const undo = reorder.createEl("button", { cls: "rr-reorder-btn rr-undo-btn", text: "↶ Undo", attr: { title: rewindTitle, "aria-label": rewindTitle } });
        undo.addEventListener("click", event => { event.stopPropagation(); options.onRewind(node, nodeKey); });
        return;
      }
      const move = async delta => {
        const target = idx + delta; if (target < 0 || target >= siblings.length) return;
        try {
          if (options.onMove) await options.onMove(node, delta);
          [siblings[idx], siblings[target]] = [siblings[target], siblings[idx]]; redraw();
        } catch (error) { options.onEditError?.(error); }
      };
      const up = reorder.createEl("button", { cls: "rr-reorder-btn", text: "↑" }); up.disabled = !ancestorsEnabled || locked(node) || idx === 0; up.addEventListener("click", () => move(-1));
      const down = reorder.createEl("button", { cls: "rr-reorder-btn", text: "↓" }); down.disabled = !ancestorsEnabled || locked(node) || idx === siblings.length - 1; down.addEventListener("click", () => move(1));
      if (isCurrent && typeof row.scrollIntoView === "function") setTimeout(() => row.scrollIntoView({ block: "center", inline: "nearest" }), 0);
    });
    if (options.onAdd) {
      const add = container.createDiv({ cls: "rr-add-task" });
      const input = add.createEl("input", { cls: "rr-input", attr: { type: "text", placeholder: "New task…", "aria-label": "New task description" } });
      const button = add.createEl("button", { cls: "rr-tool-btn", text: "Add after selected" });
      const submit = async () => {
        const selected = core.flatten(tasks).find(node => node.id === state.setupCursorId);
        if (!selected || !input.value.trim()) return;
        button.disabled = true;
        try {
          const added = await options.onAdd(selected, input.value.trim());
          if (added) {
            const parent = selected.parentId ? core.flatten(tasks).find(node => node.id === selected.parentId) : null;
            const siblings = parent ? parent.children : tasks;
            const at = siblings.indexOf(selected);
            added.parentId = parent?.id ?? (selected.parentId === null && options.addRootAsChild ? selected.id : selected.parentId);
            added.children = added.children || []; added.selected = true;
            if (selected.parentId === null && options.addRootAsChild) selected.children.push(added);
            else siblings.splice(at + 1, 0, added);
            state.setupCursorId = added.id; input.value = ""; redraw();
          }
        } catch (error) { options.onEditError?.(error); }
        finally { button.disabled = false; }
      };
      button.addEventListener("click", submit);
      input.addEventListener("keydown", event => { if (event.key === "Enter") { event.preventDefault(); submit(); } });
    }
    let pendingG = false;
    list.addEventListener("keydown", event => {
      if (["INPUT", "BUTTON"].includes(event.target.tagName)) return;
      const current = rows.findIndex(row => row.node.id === state.setupCursorId); let next = current;
      if (event.key === "j") next = Math.min(rows.length - 1, current + 1);
      else if (event.key === "k") next = Math.max(0, current - 1);
      else if (event.key === "G") next = rows.length - 1;
      else if (event.key === "g") { if (pendingG) next = 0; pendingG = !pendingG; event.preventDefault(); if (next !== current) { state.setupCursorId = rows[next].node.id; redraw(); } return; }
      else if (event.key === "/") { event.preventDefault(); container.querySelector(".rr-task-search")?.focus(); return; }
      else if ([" ", "x"].includes(event.key)) { const item = rows[current]; if (item && item.node.checkable !== false && item.ancestorsEnabled && !locked(item.node)) core.setTaskSelected(item.node, item.node.selected === false); }
      else if (event.key === "u") { const item = rows[current]; if (item && options.rewindTitle?.(item.node, keyOf(item.node))) { event.preventDefault(); options.onRewind(item.node, keyOf(item.node)); } return; }
      else if (event.key === "h") { const item = rows[current]; if (item?.node.children.length && !state.collapsedIds.includes(item.node.id)) state.collapsedIds.push(item.node.id); }
      else if (event.key === "l") state.collapsedIds = state.collapsedIds.filter(id => id !== rows[current]?.node.id);
      else if (["K", "J"].includes(event.key)) { const item = rows[current], target = item ? item.idx + (event.key === "K" ? -1 : 1) : -1; if (item?.ancestorsEnabled && !locked(item.node) && target >= 0 && target < item.siblings.length) [item.siblings[item.idx], item.siblings[target]] = [item.siblings[target], item.siblings[item.idx]]; }
      else return;
      pendingG = false; event.preventDefault(); if (next !== current && rows[next]) state.setupCursorId = rows[next].node.id; redraw();
    });
  }

  // Undo is a rewind: the chosen action and every later one are reverted.
  function rewindTitle(history, key) {
    const index = (history || []).findIndex(action => action.key === key);
    if (index < 0) return null;
    const later = history.length - index - 1;
    return `Undo — reopen this task${later ? ` and undo ${later} later action${later === 1 ? "" : "s"}` : ""}`;
  }

  function confirmRewind(history, key) {
    const index = (history || []).findIndex(action => action.key === key);
    if (index < 0) return false;
    const count = history.length - index;
    if (count <= 1 || typeof confirm !== "function") return true;
    return confirm(`Undo ${count} actions (this task and everything completed or skipped after it)? Completed tasks will be unchecked in the note.`);
  }

  function lineForKey(content, rootLine, key, defaultEstimateMs) {
    const core = requireCore(), current = model(content, rootLine, rootLine, defaultEstimateMs);
    if (!current) return null;
    const all = core.flatten([current.root]), map = new Map(all.map(node => [node.id, node]));
    return all.find(node => taskKey(node, map) === key)?.line ?? null;
  }
  function lineForKeys(content, rootLines, key, defaultEstimateMs) {
    const core = requireCore(), current = multiRootModel(content, rootLines, defaultEstimateMs);
    if (!current) return null;
    const all = core.flatten([current.root]), map = new Map(all.map(node => [node.id, node]));
    return all.find(node => taskKey(node, map) === key)?.line ?? null;
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
    const timing = options.timing || {};
    if (timing.mode !== "break") setRunnerMode(timing, session.startedAt == null ? "unassigned" : "task", Date.now(), options.taskKey);
    const header = container.createDiv({ cls: "rr-header rr-embedded-header" });
    header.createDiv({ cls: "rr-progress-label", text: options.progressLabel });
    const stop = header.createEl("button", { cls: "rr-btn-stop", text: "Stop" });
    stop.addEventListener("click", () => options.onStop?.());
    const runnerPause = header.createEl("button", { cls: "rr-btn", text: timing.mode === "break" ? "Resume runner" : "Pause runner" });
    runnerPause.addEventListener("click", () => {
      toggleRunnerPause(timing, session);
      options.onStateChange?.();
      dispose();
      options.onRefresh?.();
    });
    header.createDiv({ cls: "rr-est", text: timing.mode === "break" ? "On a break — runner paused" : "" });

    const card = container.createDiv({ cls: "rr-card" });
    const crumbs = card.createDiv({ cls: "rr-task-text rr-embedded-crumbs" });
    let closeComment = () => {};
    const openComment = (anchor, node) => {
      closeComment();
      const menu = document.body.createDiv({ cls: "rr-status-menu" });
      menu.createDiv({ cls: "rr-est", text: node.display });
      const row = menu.createDiv({ cls: "rr-tools-row" });
      const input = row.createEl("input", { cls: "rr-input", attr: { type: "text", placeholder: "Task comment…", "aria-label": "Task comment" } });
      input.value = node.comment || "";
      const save = row.createEl("button", { cls: "rr-tool-btn", text: "Save comment" });
      const cancel = row.createEl("button", { cls: "rr-tool-btn", text: "Close" });
      const feedback = menu.createDiv({ cls: "rr-est", attr: { role: "status" } });
      const outside = event => { if (!menu.contains(event.target)) closeComment(); };
      const escape = event => { if (event.key === "Escape") { event.preventDefault(); closeComment(); } };
      closeComment = () => {
        menu.remove();
        document.removeEventListener("pointerdown", outside, true);
        document.removeEventListener("keydown", escape, true);
      };
      document.addEventListener("pointerdown", outside, true);
      document.addEventListener("keydown", escape, true);
      cancel.addEventListener("click", () => closeComment());
      const rect = anchor.getBoundingClientRect();
      menu.style.width = "min(360px, calc(100vw - 16px))";
      const box = menu.getBoundingClientRect();
      menu.style.left = `${Math.max(4, Math.min(rect.left, innerWidth - box.width - 4))}px`;
      menu.style.top = `${Math.max(4, Math.min(rect.bottom + 6, innerHeight - box.height - 4))}px`;
      input.focus();
      save.addEventListener("click", async () => {
        save.disabled = true;
        try { await options.onComment(node, input.value); feedback.textContent = "Comment saved"; }
        catch (error) { feedback.textContent = `Comment not saved: ${error.message}`; }
        finally { save.disabled = false; }
      });
      input.addEventListener("keydown", event => {
        if (event.key === "Enter") { event.preventDefault(); save.click(); }
        event.stopPropagation();
      });
    };
    renderBreadcrumbs(crumbs, options.path, task.line, (_line, node) => { if (timing.mode !== "break") options.onFocus?.(node); }, false, options.onComment ? openComment : null);
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
    // Preparing Web Audio during the click that starts a routine avoids browser
    // autoplay restrictions when the chime is needed later without a gesture.
    primeDurationSound();
    card.addEventListener("pointerdown", primeDurationSound, { once: true });
    const timerRow = card.createDiv({ cls: "rr-timer-row" });
    const timer = timerRow.createDiv({ cls: "rr-timer", text: "0:00" });
    const bar = card.createDiv({ cls: "rr-bar" });
    const fill = bar.createDiv({ cls: "rr-bar-fill" });
    let previousElapsed = core.elapsedForSession(session);
    const repaint = () => {
      const elapsed = core.elapsedForSession(session);
      const remaining = task.estimateMs - elapsed;
      if (crossedPlannedDuration(previousElapsed, elapsed, task.estimateMs)) {
        (options.onDurationEnd || notifyDurationEnd)(task);
      }
      previousElapsed = elapsed;
      timer.textContent = core.formatDuration(options.countDown === false ? elapsed : remaining);
      const overdue = remaining < 0;
      fill.style.width = `${task.estimateMs ? Math.min(100, elapsed / task.estimateMs * 100) : 0}%`;
      timer.classList.toggle("rr-overdue", overdue); fill.classList.toggle("rr-overdue", overdue);
    };
    repaint();
    const interval = setInterval(repaint, options.redrawIntervalMs || 1000);
    let wakeLock = null, disposed = false;
    if (timing.mode !== "break" && typeof navigator !== "undefined" && "wakeLock" in navigator) navigator.wakeLock.request("screen").then(lock => { if (disposed) lock.release().catch(() => {}); else wakeLock = lock; }).catch(() => {});
    const dispose = () => { if (disposed) return; disposed = true; closeComment(); clearInterval(interval); wakeLock?.release().catch(() => {}); wakeLock = null; };
    const buttons = card.createDiv({ cls: "rr-btn-row" });
    const pause = buttons.createEl("button", { cls: "rr-btn", text: session.startedAt == null ? "Resume" : "Pause" });
    pause.disabled = timing.mode === "break";
    pause.title = "Pause only this task; runner time continues as unassigned time";
    pause.addEventListener("click", () => { options.onPause?.(); setRunnerMode(timing, session.startedAt == null ? "unassigned" : "task", Date.now(), options.taskKey); pause.textContent = session.startedAt == null ? "Resume" : "Pause"; repaint(); changed(); });
    const skip = buttons.createEl("button", { cls: "rr-btn", text: "Skip" });
    skip.addEventListener("click", () => { dispose(); options.onSkip?.(); });
    const done = buttons.createEl("button", { cls: "rr-btn rr-btn-primary", text: "Done" });
    skip.disabled = done.disabled = timing.mode === "break";
    const finish = status => { done.disabled = true; Promise.resolve(options.onDone?.(status)).catch(error => { done.disabled = false; throw error; }); };
    done.addEventListener("click", () => finish(null));
    done.title = "Right-click to choose a Tasks status";
    done.addEventListener("contextmenu", event => { event.preventDefault(); if (timing.mode !== "break") showStatusMenu(options.app, done, finish); });
    return { dispose, repaint };
  }

  function renderSummary(container, summary, options = {}) {
    container.createDiv({ cls: "rr-header" }).createEl("h3", { text: "Routine complete 🎉" });
    container.createDiv({ cls: "rr-embedded-progress", text: `${summary.elapsedMs != null ? `${requireCore().formatDuration(summary.elapsedMs)} total · ` : ""}${summary.processedCount} of ${summary.totalLeafCount} leaf tasks processed · ${summary.completedCount} completed` });
    if (summary.unassignedMs != null) container.createDiv({ cls: "rr-est", text: `${requireCore().formatDuration(summary.unassignedMs)} unassigned · breaks excluded` });
    if (options.actionLabel) {
      const action = container.createEl("button", { cls: "rr-btn rr-btn-primary", text: options.actionLabel });
      action.addEventListener("click", options.onAction);
    }
  }

  function renderRunner(container, options) {
    const core = requireCore();
    const state = options.state || createRunState();
    const current = sessionModel(options);
    container.empty?.();
    if (!current) {
      container.createDiv({ cls: "rr-embedded-error", text: "Referenced task no longer exists." });
      return { model: null, dispose() {} };
    }
    const runRoots = state.runTree?.length ? state.runTree : [current.root];
    const all = core.flatten(runRoots);
    const map = new Map(all.map(node => [node.id, node]));
    const keyOf = node => node._runKey || taskKey(node, map);
    const byKey = new Map(all.map(node => [keyOf(node), node]));
    const retired = new Set(state.retired || []);
    // The note is authoritative for completion: a task checked there (in an
    // earlier run, by hand, or by Done before a reload) counts as processed.
    const fileAll = core.flatten([current.root]);
    const fileMap = new Map(fileAll.map(node => [node.id, node]));
    const checkedInFile = new Set(fileAll.filter(node => node.checked).map(node => taskKey(node, fileMap)));
    const isDone = node => node.checked || retired.has(keyOf(node)) || checkedInFile.has(keyOf(node));
    const orderIndex = new Map((state.order || []).map((key, index) => [key, index]));
    const leaves = all.filter(node => core.isRunnableLeaf(node) && !isDone(node))
      .sort((a, b) => (orderIndex.get(keyOf(a)) ?? Number.MAX_SAFE_INTEGER) - (orderIndex.get(keyOf(b)) ?? Number.MAX_SAFE_INTEGER));
    const readyParents = core.readyParents(fileAll.filter(node => !node.parentId), node => node.checked,
      node => byKey.has(taskKey(node, fileMap)))
      .map(node => byKey.get(taskKey(node, fileMap)))
      .filter(node => node && !retired.has(keyOf(node)));
    let activeLeaf = byKey.get(state.activeLeafKey);
    const activeIsReadyParent = activeLeaf?.children.length && readyParents.includes(activeLeaf);
    if (!activeLeaf || isDone(activeLeaf) || (activeLeaf.children.length && !activeIsReadyParent)) activeLeaf = readyParents[0] || leaves[0] || null;
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
      elapsedBeforeStartMs: 0, startedAt: state.timing?.mode === "break" ? null : Date.now(), count: 0,
    });
    const advance = () => {
      settle(session);
      const affected = core.flatten([focus]).filter(node => core.isRunnableLeaf(node) && !retired.has(keyOf(node))).length;
      const retiredKeys = core.flatten([focus]).map(keyOf); retiredKeys.forEach(key => retired.add(key));
      state.actionHistory = [...(state.actionHistory || []), { key: keyOf(focus), kind: "skip", retiredKeys, affected }];
      state.retired = [...retired]; state.focusKey = null; state.activeLeafKey = null;
      state.processedCount = (state.processedCount || 0) + affected;
      options.onStateChange?.(state);
      if (options.onRefresh) options.onRefresh(); else renderRunner(container, options);
    };
    const finish = async status => {
      settle(session);
      const affected = core.flatten([focus]).filter(node => core.isRunnableLeaf(node) && !retired.has(keyOf(node))).length;
      state.completedCount = (state.completedCount || 0) + 1;
      state.processedCount = (state.processedCount || 0) + affected;
      core.flatten([focus]).forEach(node => retired.add(keyOf(node)));
      state.retired = [...retired]; options.onStateChange?.(state);
      try {
        const elapsedMs = focus.children.length ? subtreeElapsedTotal(state, focus, keyOf) : core.elapsedForSession(session);
        const undo = await options.onComplete?.(focus.line, { elapsedMs, count: session.count, goalCount: focus.goalCount }, status, keyOf(focus));
        state.actionHistory = [...(state.actionHistory || []), { key: keyOf(focus), kind: "done", retiredKeys: core.flatten([focus]).map(keyOf), affected, undo: undo || null }];
        options.onStateChange?.(state);
        if (options.onRefresh) options.onRefresh(); else renderRunner(container, options);
      } catch (error) {
        state.completedCount--; state.processedCount -= affected;
        core.flatten([focus]).forEach(node => retired.delete(keyOf(node)));
        state.retired = [...retired]; options.onStateChange?.(state);
        throw error;
      }
    };
    const view = renderRunCard(container, {
      app: options.app, task: focus, taskKey: keyOf(focus), session, path: activePath,
      timing: state.timing || (state.timing = { taskMs: sessionElapsedTotal(state) }),
      onRefresh: () => options.onRefresh ? options.onRefresh() : renderRunner(container, options),
      redrawIntervalMs: options.redrawIntervalMs,
      progressLabel: focus.children.length
        ? "All child tasks have a status — mark a status for this parent"
        : `Leaf ${Math.max(1, (state.processedCount || 0) + 1)} of ${state.totalLeafCount || leaves.length}`,
      onStop: () => {
        setRunnerMode(state.timing, "stopped");
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
      onComment: options.onComment,
    });
    const treeHost = container.createDiv({ cls: "rr-run-tree" });
    const activeKeys = new Set(activePath.map(keyOf));
    const syncTree = () => {
      state.treeOrder = core.flatten(runRoots).map(keyOf);
      state.enabled = Object.fromEntries(core.flatten(runRoots).map(node => [keyOf(node), node.selected !== false]));
      state.totalLeafCount = (state.processedCount || 0) + enabledLeaves(runRoots).filter(node => !retired.has(keyOf(node))).length;
      options.onStateChange?.(state);
    };
    renderSelection(treeHost, {
      app: options.app, state, tasks: runRoots, keyOf, currentKey: state.activeLeafKey, processed: all.filter(isDone).map(keyOf),
      locked: node => activeKeys.has(keyOf(node)), render: () => options.onRefresh ? options.onRefresh() : renderRunner(container, options),
      onChange: syncTree,
      onMove: options.onMove,
      onAdd: options.onAdd,
      onEstimate: options.onEstimate,
      onCheck: async (node, status) => {
        const affected = core.flatten([node]).filter(part => core.isRunnableLeaf(part) && !retired.has(keyOf(part))).length;
        const retiredKeys = core.flatten([node]).map(keyOf);
        const updated = await options.onCheck?.(node, status);
        retiredKeys.forEach(value => retired.add(value));
        state.retired = [...retired];
        state.processedCount = (state.processedCount || 0) + affected;
        state.completedCount = (state.completedCount || 0) + 1;
        state.actionHistory = [...(state.actionHistory || []), { key: keyOf(node), kind: "done", retiredKeys, affected, undo: updated?.undo || null }];
        options.onStateChange?.(state);
        return updated;
      },
      onDelete: options.onDelete,
      addRootAsChild: true,
      onEditError: error => options.onEditError?.(error),
      onReset: () => {
        const initial = JSON.parse(JSON.stringify(state.initialRunTree || []));
        const initialMap = new Map(core.flatten(initial).map(node => [keyOf(node), node]));
        core.flatten(runRoots).forEach(node => { const saved = initialMap.get(keyOf(node)); if (saved && !retired.has(keyOf(node))) node.selected = saved.selected !== false; });
      },
      rewindTitle: (_node, key) => rewindTitle(state.actionHistory, key),
      onRewind: async (_node, key) => {
        const history = state.actionHistory || [], index = history.findIndex(action => action.key === key);
        if (index < 0 || !confirmRewind(history, key)) return;
        const undone = history.slice(index);
        // The host reverts note edits and reports failures; on failure nothing
        // in the run state changes either.
        try { await options.onRewind?.(undone); } catch (error) { console.error(error); return; }
        settle(session);
        const nextRetired = new Set(state.retired || []);
        undone.forEach(action => (action.retiredKeys || []).forEach(value => nextRetired.delete(value)));
        state.retired = [...nextRetired]; state.processedCount = Math.max(0, (state.processedCount || 0) - undone.reduce((sum, action) => sum + (action.affected || 0), 0));
        state.completedCount = Math.max(0, (state.completedCount || 0) - undone.filter(action => action.kind === "done").length);
        const rewindNode = byKey.get(key);
        const rewindLeaf = rewindNode && (core.isRunnableLeaf(rewindNode) ? rewindNode : core.flatten([rewindNode]).find(core.isRunnableLeaf));
        state.actionHistory = history.slice(0, index); state.activeLeafKey = rewindLeaf ? keyOf(rewindLeaf) : key; state.focusKey = key;
        const selected = state.sessions[key] || (state.sessions[key] = { elapsedBeforeStartMs: 0, startedAt: null, count: 0 });
        if (state.timing?.mode !== "break") selected.startedAt = Date.now();
        options.onStateChange?.(state); if (options.onRefresh) options.onRefresh(); else renderRunner(container, options);
      },
    });
    return { model: current, state, dispose: view.dispose };
  }

  function renderSession(container, options) {
    const core = requireCore();
    const state = options.state || createRunState();
    const current = sessionModel(options);
    const notify = () => options.onStateChange?.(state);
    if (!current) {
      container.empty?.();
      container.createDiv({ cls: "rr-embedded-error", text: "The linked root task is missing or is no longer a task. The saved routine was retained." });
      return { model: null, state, dispose() {} };
    }
    const all = core.flatten([current.root]);
    const map = new Map(all.map(node => [node.id, node]));
    const keyOf = node => taskKey(node, map);
    const leaves = all.filter(node => core.isRunnableLeaf(node) && !node.checked);
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
      const selectionRoot = openSelectionTree(current.root);
      const selectionTasks = selectionRoot ? [selectionRoot] : [];
      const syncSelection = () => {
        const ordered = core.flatten(selectionTasks);
        ordered.forEach(node => { state.enabled[keyOf(node)] = node.selected !== false; });
        state.treeOrder = ordered.map(keyOf);
        state.selected = enabledLeaves(selectionTasks).map(keyOf).filter(key => validKeys.has(key));
        state.order = core.flatten(selectionTasks).filter(core.isRunnableLeaf).map(keyOf);
        notify();
      };
      syncSelection();
      const header = container.createDiv({ cls: "rr-selection-header" });
      const selectedCount = state.selected.length;
      const start = header.createEl("button", { cls: "rr-btn rr-btn-primary", text: selectedCount ? `Start routine (${selectedCount} leaf task${selectedCount === 1 ? "" : "s"})` : "Select at least one leaf task" });
      const startBlocked = options.canStart === false;
      start.disabled = !selectedCount || startBlocked;
      if (startBlocked && options.startBlockedReason) start.title = options.startBlockedReason;
      const selectionTree = container.createDiv({ cls: "rr-selection-tree" });
      if (options.selectionCollapsible) {
        state.selectionTreeOpen = state.selectionTreeOpen === true;
        selectionTree.hidden = !state.selectionTreeOpen;
        const toggle = header.createEl("button", { cls: "rr-btn", text: state.selectionTreeOpen ? "Hide task tree" : "Show task tree" });
        toggle.setAttribute("aria-expanded", String(state.selectionTreeOpen));
        toggle.addEventListener("click", () => {
          state.selectionTreeOpen = !state.selectionTreeOpen;
          selectionTree.hidden = !state.selectionTreeOpen;
          toggle.textContent = state.selectionTreeOpen ? "Hide task tree" : "Show task tree";
          toggle.setAttribute("aria-expanded", String(state.selectionTreeOpen));
          notify();
        });
      }
      options.renderSelectionActions?.(header);
      start.addEventListener("click", () => {
        if (options.canStart === false) return;
        primeDurationSound();
        syncSelection();
        const selectedKeys = new Set(state.selected);
        const retainSelected = (node, ancestorsEnabled = true) => {
          const enabled = ancestorsEnabled && node.selected !== false;
          if (core.isRunnableLeaf(node)) return enabled && selectedKeys.has(keyOf(node)) ? { ...node, children: [] } : null;
          const children = node.children.map(child => retainSelected(child, enabled)).filter(Boolean);
          return children.length ? { ...node, selected: true, children } : null;
        };
        const selectedRoots = selectionTasks.map(node => retainSelected(node)).filter(Boolean);
        state.retired = [];
        // Starting from the selection screen begins a new run. Do not inherit
        // paused clocks left by a prior run that was stopped back to selection.
        state.sessions = {};
        state.timing = {};
        state.focusKey = null;
        state.activeLeafKey = null;
        state.totalLeafCount = selectedCount;
        core.flatten(selectedRoots).forEach(node => { node._runKey = keyOf(node); });
        state.runTree = JSON.parse(JSON.stringify(selectedRoots));
        state.initialRunTree = JSON.parse(JSON.stringify(selectedRoots));
        state.actionHistory = [];
        state.processedCount = 0; state.completedCount = 0; state.summary = null;
        state.screen = "run"; notify();
        if (options.onRefresh) options.onRefresh(); else renderSession(container, options);
      });
      renderSelection(selectionTree, {
        app: options.app,
        state,
        tasks: selectionTasks,
        render: () => renderSession(container, options),
        onChange: syncSelection,
        onMove: options.onMove,
        onAdd: options.onAdd,
        onEstimate: options.onEstimate,
        onCheck: options.onCheck,
        onDelete: options.onDelete,
        addRootAsChild: true,
        onEditError: error => options.onEditError?.(error),
        onReset: () => {
          core.flatten(selectionTasks).forEach(node => { node.selected = true; });
          state.enabled = {};
        },
      });
      return { model: current, state, dispose() {} };
    }

    const stableRoots = state.runTree?.length ? state.runTree : [current.root];
    const stableLeaves = enabledLeaves(stableRoots);
    const stableKeys = new Set(core.flatten(stableRoots).map(node => node._runKey || keyOf(node)));
    const hasReadyParent = core.readyParents([current.root], node => node.checked,
      node => stableKeys.has(keyOf(node))).length > 0;
    if (state.screen === "summary" || (!hasReadyParent && !stableLeaves.some(node => !new Set(state.retired).has(node._runKey || keyOf(node))))) {
      if (!state.summary) {
        if (state.timing) setRunnerMode(state.timing, "stopped");
        state.summary = { ...(state.timing ? runnerTotals(state.timing) : { elapsedMs: sessionElapsedTotal(state) }), processedCount: state.processedCount || 0, completedCount: state.completedCount || 0, totalLeafCount: state.totalLeafCount || 0 };
      }
      state.screen = "summary"; notify();
      container.empty?.();
      renderSummary(container, state.summary, {
        actionLabel: options.summaryActionLabel,
        onAction: options.onSummaryAction,
      });
      options.onFinish?.(state.summary);
      return { model: current, state, dispose() {} };
    }
    return renderRunner(container, options);
  }

  return { model, multiRootModel, replacementForTask, localLifecycleParts, stampLifecycleTime, completeTaskTransaction, completeTask, undoReplacements, undoCompletionTransactions, saveTaskComment, moveTask, addTaskAfter, updateTaskEstimate, checkTask, deleteTask, durationPicker, configuredTaskStatuses, showStatusMenu, renderBreadcrumbs,
    crossedPlannedDuration, primeDurationSound, playDurationSound, sendDesktopNotification, notifyDurationEnd,
    setRunnerMode, runnerTotals, subtreeElapsedTotal, toggleRunnerPause,
    createRunState, serializeSession, deserializeSession, sessionElapsedTotal, runningSession, enabledLeaves, openSelectionTree,
    renderSelection, renderRunCard, renderSummary, renderPurgeCacheButton, installStyles,
    lineForKey, lineForKeys, rewindTitle, confirmRewind, renderRunner, renderSession };
});

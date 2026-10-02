/* Schedule Runner Obsidian/Dataview UI adapter. */
(async function ({ dv, app, moment, Notice, config }) {
const DIR = dv.current().file.folder;
const CORE_PATH = `${DIR}/schedule-runner.js`;
const UNDO_KEY = "__scheduledBlocksUndo";
const STATE_PATH = `${DIR}/schedule-runner-state.yaml`;

try {
  // The core is a UMD module. Evaluating it only installs one namespaced object.
  (0, eval)(await app.vault.adapter.read(CORE_PATH));
  const SB = globalThis.ScheduleRunner;
  (0, eval)(await app.vault.adapter.read(`${DIR}/routine-runner.js`));
  (0, eval)(await app.vault.adapter.read(`${DIR}/routine-runner-embed.js`));
  const RR = globalThis.RoutineRunner;
  const RRE = globalThis.RoutineRunnerEmbed;
  RRE.installStyles(document);
  const rawRegistry = config.registry;
  const registry = SB.validateRegistry(rawRegistry);
  if (!registry.ok) throw new Error(`Invalid Schedule Runner registry:\n${registry.errors.join("\n")}`);

  const daily = app.internalPlugins.plugins["daily-notes"]?.instance;
  const cfg = daily?.options || {};
  const format = cfg.format || "YYYY-MM-DD";
  const folder = (cfg.folder || "").replace(/\/$/, "");
  let selectedDate = moment.utc().format("YYYY-MM-DD");
  const pathForDate = date => `${folder ? folder + "/" : ""}${moment.utc(date, "YYYY-MM-DD", true).format(format)}.md`;
  let dailyPath, file;
  const selectDailyNote = () => {
    dailyPath = pathForDate(selectedDate);
    file = app.vault.getAbstractFileByPath(dailyPath);
  };

  const root = dv.container;
  let blockSelectorOpen = false;
  root.empty(); root.addClass("sb-root");
  const style = document.createElement("style");
  style.textContent = `.sb-root{display:grid;gap:.7em}.sb-card{border:1px solid var(--background-modifier-border);border-radius:8px;padding:.8em}.sb-active{border-color:var(--interactive-accent)}.sb-row{display:flex;gap:.5em;align-items:center;flex-wrap:wrap}.sb-row button{padding:5px 10px}.sb-task-badge{font-size:.7em;font-weight:700;letter-spacing:.06em;padding:.15em .45em;border:1px solid var(--interactive-accent);border-radius:999px;color:var(--interactive-accent)}.sb-muted{color:var(--text-muted)}.sb-error{color:var(--color-red)}.sb-progress{height:6px;background:var(--background-modifier-border);border-radius:3px;overflow:hidden}.sb-progress i{display:block;height:100%;background:var(--interactive-accent)}.sb-indent{margin-left:calc(var(--depth)*1em)}.rr-embedded{margin-top:.65em}`;
  root.appendChild(style);

  const button = (label, fn, disabled = false) => { const b = document.createElement("button"); b.textContent = label; b.disabled = disabled; b.onclick = fn; return b; };
  const undoRecord = (before, after, extra = null) => {
    const beforeLines = before.split(/\r?\n/), afterLines = after.split(/\r?\n/);
    let start = 0; while (start < beforeLines.length && start < afterLines.length && beforeLines[start] === afterLines[start]) start++;
    let suffix = 0; while (suffix < beforeLines.length - start && suffix < afterLines.length - start && beforeLines[beforeLines.length - 1 - suffix] === afterLines[afterLines.length - 1 - suffix]) suffix++;
    return { path: dailyPath, expires: Date.now() + (rawRegistry.settings?.["undo-seconds"] || 10) * 1000,
      start, beforeLines: beforeLines.slice(start, beforeLines.length - suffix), afterLines: afterLines.slice(start, afterLines.length - suffix), extra };
  };
  const write = async (before, after) => {
    if (!file) { file = await app.vault.create(dailyPath, after); }
    else await app.vault.modify(file, after);
    window[UNDO_KEY] = undoRecord(before, after);
    await render();
  };
  const textPicker = (title, initial = "", type = "text") => new Promise(resolve => {
    let settled = false; const modal = document.createElement("dialog"); modal.createEl("h3", { text: title });
    const input = modal.createEl("input", { type, value: initial }); input.style.width = "100%";
    const row = modal.createDiv({ cls: "sb-row" });
    const finish = value => { if (settled) return; settled = true; resolve(value); modal.close(); modal.remove(); };
    row.appendChild(button("Cancel", () => finish(null))); row.appendChild(button("Save", () => finish(input.value.trim())));
    input.addEventListener("keydown", event => { if (event.key === "Enter") finish(input.value.trim()); });
    modal.addEventListener("cancel", event => { event.preventDefault(); finish(null); });
    document.body.appendChild(modal); modal.showModal(); input.focus(); input.select();
  });
  const utcPicker = async initial => {
    const nativeValue = await textPicker("UTC time", `${initial.slice(0, 2)}:${initial.slice(2)}`, "time");
    const value = nativeValue?.replace(":", "");
    if (value == null) return null;
    if (!/^(?:[01]\d|2[0-3])[0-5]\d$/.test(value)) { new Notice("Use a valid UTC HHMM time"); return null; }
    return value;
  };
  const editTime = async (text, entry, edge = "start") => {
    const value = await utcPicker(edge === "end" ? entry.end : entry.start); if (!value) return;
    try { await write(text, SB.editActualTime(text, entry.line, edge, value)); } catch (x) { new Notice(x.message); }
  };
  const actualPlanSlug = entry => entry.id?.match(/^a-(.+)-\d+$/)?.[1] || null;
  const displayBody = (body, evidence) => evidence?.displayText
    ? String(body).replace(/\[\[[^\]]+\]\]/u, evidence.displayText)
    : body;
  const addBodyLabel = (row, body, evidence) => {
    if (evidence?.isTask) row.createEl("span", { text: "TASK", cls: "sb-task-badge" });
    row.createEl("strong", { text: displayBody(body, evidence) || "Main boundary" });
  };
  const taskEvidence = async body => {
    const link = SB.taskLink(body);
    if (!link) return null;
    // An empty link path is Obsidian's current-note shorthand: [[#^block-id]].
    const target = link.path
      ? app.metadataCache.getFirstLinkpathDest(link.path, dailyPath)
      : file || app.vault.getAbstractFileByPath(dailyPath);
    if (!target) return { source: true, label: "linked task not found" };
    const taskText = await app.vault.read(target), taskLines = taskText.split(/\r?\n/);
    const lineIndex = taskLines.findIndex(x => x.match(new RegExp(`\\^${link.blockId}\\s*$`)));
    const line = lineIndex >= 0 ? taskLines[lineIndex] : "";
    const pageProject = app.metadataCache.getFileCache(target)?.frontmatter?.project || null;
    const nested = lineIndex >= 0 ? RRE.model(taskText, lineIndex) : null;
    const isTask = !!nested;
    const hasIncompleteDescendants = !!nested?.hasIncompleteDescendants;
    // Every label, task or plain list block, goes through the shared
    // Routine Runner display rules (metadata, comments, block IDs).
    return { source: SB.resolveTaskClassification(line, pageProject), label: target.basename, displayText: nested ? nested.root.display : RR.taskDisplay(line), target, taskText, line, lineIndex, blockId: link.blockId, isTask, completed: /^\s*[-*+]\s+\[[xX]\]/.test(line), hasIncompleteDescendants };
  };
  // Only write coordination and view cleanup survive a Dataview re-execution.
  // Routine session data is rehydrated from schedule-runner-state.yaml below.
  const embeddedCoordinator = window.__scheduleRunnerRoutineCoordinator ?? (window.__scheduleRunnerRoutineCoordinator = { disposers: [], actionTail: Promise.resolve(), saveTimer: null });
  if (!Array.isArray(embeddedCoordinator.disposers)) embeddedCoordinator.disposers = [];
  if (!embeddedCoordinator.actionTail || typeof embeddedCoordinator.actionTail.then !== "function") embeddedCoordinator.actionTail = Promise.resolve();
  clearTimeout(embeddedCoordinator.saveTimer); embeddedCoordinator.saveTimer = null;
  embeddedCoordinator.disposers.splice(0).forEach(dispose => dispose());
  const embeddedRuns = { states: {}, legacy: {} };
  const enqueueEmbedded = action => {
    const prior = embeddedCoordinator.actionTail && typeof embeddedCoordinator.actionTail.then === "function"
      ? embeddedCoordinator.actionTail
      : Promise.resolve();
    embeddedCoordinator.actionTail = prior.catch(() => {}).then(action);
    return embeddedCoordinator.actionTail;
  };
  const stateFile = app.vault.getAbstractFileByPath(STATE_PATH);
  if (stateFile) {
    try {
      const saved = JSON.parse(await app.vault.read(stateFile));
      if (typeof saved.selectedDate === "string" && moment.utc(saved.selectedDate, "YYYY-MM-DD", true).isValid()) selectedDate = saved.selectedDate;
      if (saved["schedule-runner-state-version"] === 2 && saved.sessions && typeof saved.sessions === "object") {
        embeddedRuns.states = Object.fromEntries(Object.entries(saved.sessions).map(([key, value]) => [key, RRE.deserializeSession(value)]));
        embeddedRuns.legacy = saved.legacy || {};
      } else if (saved["schedule-runner-state-version"] === 1 && saved.routines && typeof saved.routines === "object") {
        // Migration is completed lazily when a canonical link is seen on an
        // active Plan block; unmatched records remain visible and preserved.
        embeddedRuns.legacy = saved.routines;
      }
    } catch (error) {
      new Notice(`Schedule runner state was not loaded: ${error.message}`);
    }
  }
  selectDailyNote();
  const embeddedStateSnapshot = () => `${JSON.stringify({ "schedule-runner-state-version": 2,
    selectedDate,
    sessions: Object.fromEntries(Object.entries(embeddedRuns.states).map(([key, value]) => [key, RRE.serializeSession(value)])),
    ...(Object.keys(embeddedRuns.legacy || {}).length ? { legacy: embeddedRuns.legacy } : {}),
  }, null, 2)}\n`;
  const writeEmbeddedState = snapshot => {
    const write = enqueueEmbedded(async () => {
      const stateFile = app.vault.getAbstractFileByPath(STATE_PATH);
      if (stateFile) await app.vault.modify(stateFile, snapshot); else await app.vault.create(STATE_PATH, snapshot);
    });
    embeddedCoordinator.actionTail = write.catch(error => new Notice(`Schedule runner state was not saved: ${error.message}`));
    return embeddedCoordinator.actionTail;
  };
  const ensureEmbeddedState = async () => {
    if (app.vault.getAbstractFileByPath(STATE_PATH)) return;
    try { await app.vault.create(STATE_PATH, embeddedStateSnapshot()); }
    catch (error) {
      // Another render may have created it while this one was awaiting Vault I/O.
      if (!app.vault.getAbstractFileByPath(STATE_PATH)) throw error;
    }
  };
  const saveEmbeddedState = () => {
    clearTimeout(embeddedCoordinator.saveTimer);
    embeddedCoordinator.saveTimer = setTimeout(() => {
      writeEmbeddedState(embeddedStateSnapshot());
    }, 250);
  };
  const addEmbeddedRoutine = async (card, evidence, sessionKey) => {
    if (!evidence?.isTask || evidence.lineIndex < 0) return;
    await ensureEmbeddedState();
    const canonicalKey = `${evidence.target.path}#^${evidence.blockId}`;
    const initial = RRE.model(evidence.taskText, evidence.lineIndex);
    if (!initial) return;
    const host = card.createDiv({ cls: "rr-embedded" });
    if (!embeddedRuns.states[sessionKey] && embeddedRuns.legacy?.[canonicalKey]) {
      embeddedRuns.states[sessionKey] = RRE.deserializeSession(embeddedRuns.legacy[canonicalKey]);
      delete embeddedRuns.legacy[canonicalKey]; saveEmbeddedState();
    }
    const runState = embeddedRuns.states[sessionKey] ?? (embeddedRuns.states[sessionKey] = { ...RRE.createRunState(), screen: "ready" });
    const resetRunState = screen => {
      const fresh = RRE.createRunState();
      Object.keys(runState).forEach(key => delete runState[key]);
      Object.assign(runState, fresh, { screen });
    };
    RRE.renderPurgeCacheButton(host, {
      onPurge: async () => {
        delete embeddedRuns.states[sessionKey];
        await writeEmbeddedState(embeddedStateSnapshot());
        new Notice("Scheduled routine cache purged");
        await enqueueEmbedded(render);
      },
    });
    const sessionHost = host.createDiv({ cls: "rr-session" });
    if (runState.screen === "ready") {
      const begin = sessionHost.createEl("button", { cls: "rr-btn rr-btn-primary", text: "Begin tasks" });
      begin.addEventListener("click", () => {
        resetRunState("select");
        saveEmbeddedState();
        enqueueEmbedded(render).catch(error => new Notice(`Schedule runner refresh failed: ${error.message}`));
      });
      return;
    }
    // renderSession owns selection, execution (via its shared renderRunner), and summary.
    const view = RRE.renderSession(sessionHost, {
      app, content: evidence.taskText, rootLine: evidence.lineIndex, state: runState,
      sourcePath: evidence.target.path, rootBlockId: evidence.blockId,
      onStateChange: saveEmbeddedState,
      onComment: (task, comment) => enqueueEmbedded(async () => {
        Object.assign(task, await RRE.saveTaskComment(app, evidence.target, task, comment));
      }),
      onMove: (task, delta) => enqueueEmbedded(() => RRE.moveTask(app, evidence.target, task, delta)),
      onAdd: (task, description) => enqueueEmbedded(async () => {
        const result = await RRE.addTaskAfter(app, evidence.target, task, description, task.parentId === null);
        const added = { ...result.task, id: `live-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, children: [], selected: true };
        const parentKey = task._runKey || runState.focusKey || "";
        added._runKey = task.parentId === null ? `${parentKey}\u0000${added.display}` : `${parentKey.slice(0, parentKey.lastIndexOf("\u0000"))}${parentKey.includes("\u0000") ? "\u0000" : ""}${added.display}`;
        saveEmbeddedState();
        return added;
      }),
      onEstimate: (task, value) => enqueueEmbedded(() => RRE.updateTaskEstimate(app, evidence.target, task, value)),
      onCheck: (task, status) => enqueueEmbedded(() => RRE.checkTask(app, evidence.target, task, status)),
      onDelete: task => enqueueEmbedded(() => RRE.deleteTask(app, evidence.target, task)),
      onEditError: error => new Notice(`Task tree was not changed: ${error.message}`, 8000),
      onRefresh: () => enqueueEmbedded(render).catch(error => new Notice(`Schedule runner refresh failed: ${error.message}`)),
      summaryActionLabel: "Back to task block",
      onSummaryAction: () => {
        resetRunState("ready");
        saveEmbeddedState();
        enqueueEmbedded(render).catch(error => new Notice(`Schedule runner refresh failed: ${error.message}`));
      },
      onComplete: async (line, result, status, taskKey) => {
        let undoToken = null;
        const completion = enqueueEmbedded(async () => {
          const current = await app.vault.read(evidence.target);
          const rootMatches = current.split(/\r?\n/).map((value, index) => value.match(new RegExp(`\\^${evidence.blockId}\\s*$`)) ? index : -1).filter(index => index >= 0);
          if (rootMatches.length !== 1) throw new Error(rootMatches.length ? "The linked root block ID is ambiguous" : "The linked root task no longer exists");
          const rootLine = rootMatches[0];
          const currentLine = RRE.lineForKey(current, rootLine, taskKey || runState.focusKey) ?? line;
          const transaction = await RRE.completeTaskTransaction(app, evidence.target, current, currentLine, status, result);
          undoToken = transaction.undo;
        });
        embeddedCoordinator.actionTail = completion.catch(error => { new Notice(`Task completion failed: ${error.message}`); });
        await embeddedCoordinator.actionTail;
        return undoToken;
      },
      onRewind: async actions => {
        const tokens = actions.filter(action => action.kind === "done" && action.undo).map(action => action.undo);
        if (!tokens.length) return;
        const rewind = enqueueEmbedded(async () => {
          const current = await app.vault.read(evidence.target);
          await RRE.undoCompletionTransactions(app, evidence.target, current, tokens);
        });
        embeddedCoordinator.actionTail = rewind.catch(() => {});
        try { await rewind; } catch (error) { new Notice(error.message); throw error; }
      },
    });
    embeddedCoordinator.disposers.push(view.dispose);
  };
  const completeTask = async (_dailyText, evidence) => {
    if (!evidence.blockId || evidence.lineIndex < 0 || !/- \[ \]/.test(evidence.line)) return new Notice("Linked canonical task is not an incomplete checkbox");
    try {
      const current = await app.vault.read(evidence.target);
      await RRE.completeTask(app, evidence.target, current, evidence.lineIndex);
      await render();
    } catch (error) { new Notice(`Task completion failed: ${error.message}`); }
  };

  async function render() {
    embeddedCoordinator.disposers.splice(0).forEach(dispose => dispose());
    [...root.children].filter(x => x !== style).forEach(x => x.remove());
    const title = root.createEl("div", { cls: "sb-row" });
    const dateLabel = title.createEl("label", { text: "Daily note " });
    const dateInput = dateLabel.createEl("input", { type: "date", value: selectedDate });
    dateInput.setAttribute("aria-label", "Daily note date");
    dateInput.onchange = async () => {
      const value = dateInput.value;
      if (!moment.utc(value, "YYYY-MM-DD", true).isValid()) { dateInput.value = selectedDate; return; }
      dateInput.disabled = true;
      clearTimeout(embeddedCoordinator.saveTimer);
      selectedDate = value;
      blockSelectorOpen = false;
      await writeEmbeddedState(embeddedStateSnapshot());
      await enqueueEmbedded(async () => { selectDailyNote(); await render(); });
    };
    title.createEl("strong", { text: `UTC · ${dailyPath}` });
    title.appendChild(button("Refresh", render));
    const undo = window[UNDO_KEY];
    title.appendChild(button("Undo", async () => {
      if (!undo || undo.path !== dailyPath || Date.now() > undo.expires) return;
      const current = await app.vault.read(file), result = SB.replaceIfUnchanged(current, undo);
      if (!result.ok) return new Notice("Undo skipped: the generated line was edited");
      if (undo.extra) {
        const extraFile = app.vault.getAbstractFileByPath(undo.extra.path), extraCurrent = extraFile && await app.vault.read(extraFile);
        if (extraCurrent !== undo.extra.after) return new Notice("Undo skipped: the completed task was edited");
        try {
          await app.vault.modify(extraFile, undo.extra.before); await app.vault.modify(file, result.text);
        } catch (error) {
          try { await app.vault.modify(extraFile, undo.extra.after); } catch (_) {}
          return new Notice(`Undo failed and task rollback was attempted: ${error.message}`);
        }
      } else {
        await app.vault.modify(file, result.text);
      }
      window[UNDO_KEY] = null; await render();
    }, !undo || undo.path !== dailyPath || Date.now() > undo.expires));
    if (!file) { root.createEl("div", { text: "The selected Daily Note does not exist. Create it to add a Plan.", cls: "sb-muted" }); return; }
    let text = await app.vault.read(file);
    const repairedActual = SB.ensureActualIds(text);
    if (repairedActual.errors.length) { repairedActual.errors.forEach(message => root.createEl("div", { text: message, cls: "sb-error" })); return; }
    if (repairedActual.changed) { await write(text, repairedActual.text); new Notice(`Assigned ${repairedActual.assigned.length} Actual Block ID${repairedActual.assigned.length === 1 ? "" : "s"}`); return; }
    const repaired = SB.ensurePlanIds(text);
    if (repaired.errors.length) { repaired.errors.forEach(message => root.createEl("div", { text: message, cls: "sb-error" })); return; }
    if (repaired.changed) { await write(text, repaired.text); new Notice(`Assigned ${repaired.assigned.length} Scheduled Block ID${repaired.assigned.length === 1 ? "" : "s"}`); return; }
    const plan = SB.parseSection(text, "Plan"), state = SB.actualState(text), dismissed = SB.dismissedPlanIds(text);
    const planSlug = e => e.id?.replace(/^p-/, "");
    const isActive = e => [...state.mainChain, ...state.contexts].some(a => actualPlanSlug(a) === planSlug(e));
    const hasOccurred = e => state.section.entries.some(a => actualPlanSlug(a) === planSlug(e));
    const routineKeyFor = e => plan.entries.find(p => planSlug(p) === actualPlanSlug(e))?.id || e.id;
    const switchBlocked = (source, target) => SB.actualState(source).mainChain.slice(SB.switchDepth(source, target))
      .some(e => RRE.runningSession(embeddedRuns.states[routineKeyFor(e)]));
    const renderedPath = dailyPath;
    const activate = target => enqueueEmbedded(async () => {
      try {
        if (dailyPath !== renderedPath || file?.path !== renderedPath) throw new Error("The selected daily note changed");
        const current = await app.vault.read(file);
        const fresh = SB.parseSection(current, "Plan").entries.find(e => e.id === target.id);
        if (!fresh) throw new Error("This planned block no longer exists. Refresh the runner.");
        if (fresh.role === "main" && switchBlocked(current, fresh)) throw new Error("Pause the routine timer before switching this scheduled block.");
        if (fresh.role === "context" && SB.actualState(current).contexts.some(e => actualPlanSlug(e) === planSlug(fresh))) throw new Error("This context is already active");
        const next = fresh.role === "main" ? SB.switchBlock(current, fresh) : SB.startBlock(current, fresh);
        blockSelectorOpen = false;
        await write(current, next);
      } catch (error) { new Notice(error.message); }
    });
    let selector;
    const openSwitch = () => {
      blockSelectorOpen = true;
      selector.hidden = false;
      selector.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
    };
    const activeIds = new Set([...state.mainChain, ...state.contexts].map(x => x.id));
    if (state.mainChain.length || state.contexts.length) {
      root.createEl("h3", { text: "Active" });
      for (const e of [...state.mainChain, ...state.contexts]) {
        const card = root.createEl("div", { cls: "sb-card sb-active" });
        const evidence = await taskEvidence(e.body);
        const row = card.createEl("div", { cls: "sb-row" }); addBodyLabel(row, e.body, evidence);
        const time = row.createEl("button", { text: e.role === "context" ? `${e.start}-` : e.start }); time.onclick = () => editTime(text, e);
        if (e.role === "context" && e.end) { const end = row.createEl("button", { text: e.end }); end.onclick = () => editTime(text, e, "end"); }
        const pid = actualPlanSlug(e), planned = plan.entries.find(p => p.id && p.id.replace(/^p-/, "") === pid);
        const routineKey = planned?.id || e.id;
        const routineRunning = RRE.runningSession(embeddedRuns.states[routineKey]);
        if (e.role === "main") row.appendChild(button("Switch block", openSwitch, routineRunning));
        else row.appendChild(button("End", () => enqueueEmbedded(async () => {
          try {
            if (RRE.runningSession(embeddedRuns.states[routineKey])) throw new Error("Pause the routine timer first.");
            const current = await app.vault.read(file), fresh = SB.actualState(current).contexts.find(a => a.id === e.id);
            if (!fresh) throw new Error("This context is no longer active.");
            await write(current, SB.endBlock(current, fresh));
          } catch (x) { new Notice(x.message); }
        }), routineRunning));
        if (routineRunning) card.createDiv({ cls: "sb-muted", text: "Pause the routine timer before switching or ending this scheduled block." });
        const progress = planned && SB.progressFor(planned, e, new Date());
        if (progress) { const bar = card.createDiv({ cls: "sb-progress" }); const fill = bar.createEl("i"); fill.style.width = `${progress.percent}%`; if (progress.overrun) card.createDiv({ text: `Overrun ${progress.overrun}m`, cls: "sb-error" }); }
        await addEmbeddedRoutine(card, evidence, routineKey);
      }
    }
    const attachedRoutineKeys = new Set([...state.mainChain, ...state.contexts].map(e => {
      const pid = actualPlanSlug(e), planned = plan.entries.find(p => p.id && p.id.replace(/^p-/, "") === pid);
      return planned?.id || e.id;
    }));
    for (const [key, routine] of Object.entries(embeddedRuns.states)) {
      if (!attachedRoutineKeys.has(key) && RRE.runningSession(routine)) {
        const warning = root.createDiv({ cls: "sb-card sb-error" });
        warning.createSpan({ text: `Routine ${key} is still running without an active schedule card. ` });
        warning.appendChild(button("Pause routine", () => {
          const now = Date.now();
          Object.values(routine.sessions || {}).forEach(session => {
            if (session.startedAt != null) { session.elapsedBeforeStartMs = (Number(session.elapsedBeforeStartMs) || 0) + Math.max(0, now - Number(session.startedAt)); session.startedAt = null; }
          });
          saveEmbeddedState(); render();
        }));
      }
    }
    const endedContexts = state.section.entries.filter(e => e.role === "context" && e.end).slice(-5).reverse();
    if (endedContexts.length) {
      root.createEl("h3", { text: "Recent contexts" });
      for (const e of endedContexts) {
        const row = root.createEl("div", { cls: "sb-row sb-muted" }); row.createEl("span", { text: e.body });
        const slug = actualPlanSlug(e), planned = plan.entries.find(p => p.role === "context" && p.id?.replace(/^p-/, "") === slug);
        if (planned?.end) {
          const minutes = value => Number(value.slice(0, 2)) * 60 + Number(value.slice(2));
          const late = minutes(e.end) - minutes(planned.end);
          if (late > 0) row.createEl("span", { text: `Ended ${late}m late`, cls: "sb-error" });
        }
        const start = row.createEl("button", { text: e.start }); start.onclick = () => editTime(text, e, "start");
        const end = row.createEl("button", { text: e.end }); end.onclick = () => editTime(text, e, "end");
      }
    }
    if (!state.mainLeaf) {
      const selectionControls = root.createDiv({ cls: "sb-row" });
      selectionControls.appendChild(button("Select time block", openSwitch));
    }
    selector = root.createDiv({ cls: "sb-block-selector" });
    selector.hidden = !!state.mainLeaf && !blockSelectorOpen;
    selector.createEl("h3", { text: "Select time block" });
    selector.createEl("p", { text: "The current block stays active until you choose its replacement. Contexts run alongside it.", cls: "sb-muted" });
    selector.appendChild(button("Cancel", () => { blockSelectorOpen = false; selector.hidden = true; }));
    selector.createEl("h4", { text: "Plan / active ancestors" });
    if (plan.start < 0) selector.createEl("div", { text: "Add a ## Plan section to the selected note.", cls: "sb-muted" });
    const nowHHMM = SB.hhmm(new Date());
    for (const e of plan.entries.filter(x => x.role !== "boundary" && !dismissed.has(x.id) && (!hasOccurred(x) || isActive(x)))) {
      const card = selector.createEl("div", { cls: "sb-card sb-indent" }); card.style.setProperty("--depth", e.indent / 2);
      const row = card.createEl("div", { cls: "sb-row" });
      const requirement = SB.inheritedRequirement(e, registry), evidence = await taskEvidence(e.body);
      addBodyLabel(row, e.body, evidence); row.createEl("span", { text: e.role === "context" ? `${e.start}-${e.end || "…"}` : e.duration ? `${e.start} +${e.duration}m` : e.start, cls: "sb-muted" });
      if (evidence) {
        const result = SB.classify(evidence.source, requirement, registry);
        if (SB.shouldShowClassification(result.state, rawRegistry.settings?.["warning-level"]))
          row.createEl("span", { text: `${result.state}: ${evidence.label}`, cls: result.state === "conflict" ? "sb-error" : "sb-muted" });
        if (evidence.blockId) {
          const affected = state.mainChain.findIndex(a => SB.taskBlockId(a.body) === evidence.blockId);
          const descendantBlocked = affected >= 0 && state.mainChain.slice(affected + 1).some(a => SB.taskBlockId(a.body) !== evidence.blockId);
          row.appendChild(button("Done", () => completeTask(text, evidence), evidence.completed || evidence.lineIndex < 0 || descendantBlocked || evidence.hasIncompleteDescendants));
        }
      }
      const blocked = e.role === "main" && switchBlocked(text, e);
      const occurred = new RegExp(`\\^a-${e.id.replace(/^p-/, "")}-\\d+\\b`).test(text);
      const active = [...state.mainChain, ...state.contexts].some(a => actualPlanSlug(a) === e.id.replace(/^p-/, ""));
      const missed = !occurred && !active && e.start < nowHHMM;
      const activeLeafOrContext = active && (e.role === "context" || routineKeyFor(state.mainLeaf || {}) === e.id);
      row.appendChild(button(e.role === "main" && state.mainChain.length ? "Switch here" : missed ? "Start late" : "Start", () => activate(e), blocked || activeLeafOrContext));
      if (missed) row.appendChild(button("Dismiss", async () => { try { await write(text, SB.dismissBlock(text, e)); } catch (x) { new Notice(x.message); } }));
      const scheduledProgress = e.role === "context" && e.end ? SB.progressFor(e, null, new Date()) : null;
      if (scheduledProgress) { const bar = card.createDiv({ cls: "sb-progress" }); const fill = bar.createEl("i"); fill.style.width = `${scheduledProgress.percent}%`; }
      if (evidence?.isTask && evidence.lineIndex >= 0 && !active) await addEmbeddedRoutine(card, evidence, e.id);
    }
    const endedBlocks = plan.entries.filter(e => e.role !== "boundary" && hasOccurred(e) && !isActive(e));
    if (endedBlocks.length) {
      selector.createEl("h4", { text: "Ended blocks" });
      for (const e of endedBlocks) {
        const row = selector.createDiv({ cls: "sb-row" });
        addBodyLabel(row, e.body, await taskEvidence(e.body));
        row.appendChild(button("Restart", () => activate(e), e.role === "main" && switchBlocked(text, e)));
      }
    }
    selector.createEl("h4", { text: "Unplanned block" });
    const description = selector.createEl("input", { type: "text", placeholder: "Block description", value: "" });
    description.setAttribute("aria-label", "Unplanned block description");
    const tools = selector.createDiv({ cls: "sb-row" });
    const startUnplanned = context => enqueueEmbedded(async () => {
      try {
        if (dailyPath !== renderedPath) throw new Error("The selected daily note changed");
        const body = description.value.trim();
        if (!body) throw new Error("Enter a block description first.");
        if (/[\r\n]/.test(body)) throw new Error("Use a single-line block description.");
        const current = await app.vault.read(file);
        if (!context && SB.actualState(current).mainChain.some(e => RRE.runningSession(embeddedRuns.states[routineKeyFor(e)])))
          throw new Error("Pause the routine timer before switching this scheduled block.");
        const id = SB.randomBlockId("a", current);
        blockSelectorOpen = false;
        await write(current, SB.appendActual(current, `- ${SB.hhmm(new Date())}${context ? "-" : ""} ${body} ^${id}`));
      } catch (error) { new Notice(error.message); }
    });
    tools.appendChild(button("Start new block", () => startUnplanned(false), state.mainChain.some(e => RRE.runningSession(embeddedRuns.states[routineKeyFor(e)]))));
    tools.appendChild(button("Start new context", () => startUnplanned(true)));
  }
  await writeEmbeddedState(embeddedStateSnapshot());
  await render();
} catch (error) {
  dv.el("div", error.stack || error.message, { cls: "sb-error" });
}
})(globalThis.__scheduleRunnerEntry);

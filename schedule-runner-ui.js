/* Schedule Runner Obsidian/Dataview UI adapter. */
(async function ({ dv, app, moment, Notice, config }) {
const DIR = dv.current().file.folder;
  const CORE_PATH = `${DIR}/schedule-runner.js`;
const REGISTRY_PATH = config.registryPath || `${DIR}/projects.yaml`;
const UNDO_KEY = "__scheduledBlocksUndo";

try {
  // The core is a UMD module. Evaluating it only installs one namespaced object.
  (0, eval)(await app.vault.adapter.read(CORE_PATH));
  const SB = globalThis.ScheduleRunner;
  const rawRegistry = SB.parseRegistryYaml(await app.vault.adapter.read(REGISTRY_PATH));
  const registry = SB.validateRegistry(rawRegistry);
  if (!registry.ok) throw new Error(`Invalid projects.yaml:\n${registry.errors.join("\n")}`);

  const daily = app.internalPlugins.plugins["daily-notes"]?.instance;
  const cfg = daily?.options || {};
  const format = cfg.format || "YYYY-MM-DD";
  const folder = (cfg.folder || "").replace(/\/$/, "");
  const dailyPath = `${folder ? folder + "/" : ""}${moment.utc().format(format)}.md`;
  let file = app.vault.getAbstractFileByPath(dailyPath);

  const root = dv.container;
  root.empty(); root.addClass("sb-root");
  const style = document.createElement("style");
  style.textContent = `.sb-root{display:grid;gap:.7em}.sb-card{border:1px solid var(--background-modifier-border);border-radius:8px;padding:.8em}.sb-active{border-color:var(--interactive-accent)}.sb-row{display:flex;gap:.5em;align-items:center;flex-wrap:wrap}.sb-row button{padding:5px 10px}.sb-muted{color:var(--text-muted)}.sb-error{color:var(--color-red)}.sb-progress{height:6px;background:var(--background-modifier-border);border-radius:3px;overflow:hidden}.sb-progress i{display:block;height:100%;background:var(--interactive-accent)}.sb-indent{margin-left:calc(var(--depth)*1em)}`;
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
  const taskEvidence = async body => {
    const match = String(body).match(/\[\[([^\]|#]+)(?:#\^([\w-]+))?(?:\|[^\]]+)?\]\]/u);
    if (!match) return null;
    const target = app.metadataCache.getFirstLinkpathDest(match[1], dailyPath); if (!target) return { source: true, label: "linked task not found" };
    const taskText = await app.vault.read(target), taskLines = taskText.split(/\r?\n/);
    const lineIndex = match[2] ? taskLines.findIndex(x => x.match(new RegExp(`\\^${match[2]}\\s*$`))) : -1;
    const line = lineIndex >= 0 ? taskLines[lineIndex] : "";
    const pageProject = app.metadataCache.getFileCache(target)?.frontmatter?.project || null;
    return { source: SB.resolveTaskClassification(line, pageProject), label: target.basename, target, taskText, line, lineIndex, blockId: match[2], completed: /- \[[xX]\]/.test(line) };
  };
  const completeTask = async (dailyText, evidence) => {
    if (!evidence.blockId || evidence.lineIndex < 0 || !/- \[ \]/.test(evidence.line)) return new Notice("Linked canonical task is not an incomplete checkbox");
    let nextDaily;
    try { nextDaily = SB.doneTaskActuals(dailyText, evidence.blockId, new Date()); } catch (x) { return new Notice(x.message); }
    if (evidence.target.path === dailyPath) {
      const lines = nextDaily.split(/\r?\n/), index = lines.findIndex(x => x.includes(`^${evidence.blockId}`));
      if (index < 0 || !/- \[ \]/.test(lines[index])) return new Notice("Canonical task changed before Done");
      lines[index] = lines[index].replace(/- \[ \]/, "- [x]"); await write(dailyText, lines.join("\n")); return;
    }
    const taskLines = evidence.taskText.split(/\r?\n/); taskLines[evidence.lineIndex] = taskLines[evidence.lineIndex].replace(/- \[ \]/, "- [x]");
    const nextTask = taskLines.join("\n"), extra = { path: evidence.target.path, before: evidence.taskText, after: nextTask };
    try {
      await app.vault.modify(file, nextDaily);
      await app.vault.modify(evidence.target, nextTask);
    } catch (error) {
      try { await app.vault.modify(file, dailyText); } catch (_) {}
      new Notice(`Done failed and Daily Note was rolled back: ${error.message}`); return;
    }
    window[UNDO_KEY] = undoRecord(dailyText, nextDaily, extra); await render();
  };

  async function render() {
    [...root.children].filter(x => x !== style).forEach(x => x.remove());
    const title = root.createEl("div", { cls: "sb-row" });
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
    }, !undo || Date.now() > undo.expires));
    if (!file) { root.createEl("div", { text: "Today’s Daily Note does not exist. Starting a block will create it.", cls: "sb-muted" }); return; }
    let text = await app.vault.read(file);
    const repaired = SB.ensurePlanIds(text);
    if (repaired.errors.length) { repaired.errors.forEach(message => root.createEl("div", { text: message, cls: "sb-error" })); return; }
    if (repaired.changed) { await write(text, repaired.text); new Notice(`Assigned ${repaired.assigned.length} Scheduled Block ID${repaired.assigned.length === 1 ? "" : "s"}`); return; }
    const plan = SB.parseSection(text, "Plan"), state = SB.actualState(text), dismissed = SB.dismissedPlanIds(text), completed = SB.completedPlanSlugs(text);
    const activeIds = new Set([...state.mainChain, ...state.contexts].map(x => x.id));
    if (state.mainChain.length || state.contexts.length) {
      root.createEl("h3", { text: "Active" });
      for (const e of [...state.mainChain, ...state.contexts]) {
        const card = root.createEl("div", { cls: "sb-card sb-active" });
        const row = card.createEl("div", { cls: "sb-row" }); row.createEl("strong", { text: e.body || "Main boundary" });
        const time = row.createEl("button", { text: e.role === "context" ? `${e.start}-` : e.start }); time.onclick = () => editTime(text, e);
        if (e.role === "context" && e.end) { const end = row.createEl("button", { text: e.end }); end.onclick = () => editTime(text, e, "end"); }
        const stop = mode => async () => { try { await write(text, SB.endBlock(text, e, new Date(), mode)); } catch (x) { new Notice(x.message); } };
        row.appendChild(button("End", stop("end"))); row.appendChild(button("Pause", stop("pause")));
        const pid = actualPlanSlug(e), planned = plan.entries.find(p => p.id && p.id.replace(/^p-/, "") === pid);
        const progress = planned && SB.progressFor(planned, e, new Date());
        if (progress) { const bar = card.createDiv({ cls: "sb-progress" }); const fill = bar.createEl("i"); fill.style.width = `${progress.percent}%`; if (progress.overrun) card.createDiv({ text: `Overrun ${progress.overrun}m`, cls: "sb-error" }); }
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
    root.createEl("h3", { text: "Plan" });
    if (plan.start < 0) root.createEl("div", { text: "Add a ## Plan section to today’s note.", cls: "sb-muted" });
    const nowHHMM = SB.hhmm(new Date());
    for (const e of plan.entries.filter(x => x.role !== "boundary" && !dismissed.has(x.id) && !completed.has(x.id?.replace(/^p-/, "")))) {
      const card = root.createEl("div", { cls: "sb-card sb-indent" }); card.style.setProperty("--depth", e.indent / 2);
      const row = card.createEl("div", { cls: "sb-row" });
      row.createEl("strong", { text: e.body }); row.createEl("span", { text: e.role === "context" ? `${e.start}-${e.end || "…"}` : e.duration ? `${e.start} +${e.duration}m` : e.start, cls: "sb-muted" });
      const requirement = SB.inheritedRequirement(e, registry), evidence = await taskEvidence(e.body);
      if (evidence) {
        const result = SB.classify(evidence.source, requirement, registry);
        if (SB.shouldShowClassification(result.state, rawRegistry.settings?.["warning-level"]))
          row.createEl("span", { text: `${result.state}: ${evidence.label}`, cls: result.state === "conflict" ? "sb-error" : "sb-muted" });
        if (evidence.blockId) {
          const affected = state.mainChain.findIndex(a => SB.taskBlockId(a.body) === evidence.blockId);
          const descendantBlocked = affected >= 0 && state.mainChain.slice(affected + 1).some(a => SB.taskBlockId(a.body) !== evidence.blockId);
          row.appendChild(button(evidence.completed ? "Done" : "Done", () => completeTask(text, evidence), evidence.completed || evidence.lineIndex < 0 || descendantBlocked));
        }
      }
      let blocked = false;
      if (e.role === "main" && state.mainChain.length) {
        const wanted = []; for (let p = e; p; p = p.parent) if (p.role === "main") wanted.unshift(String(p.id || "").replace(/^p-/, ""));
        const active = state.mainChain.map(x => x.id?.match(/^a-(.+)-\d+$/)?.[1]);
        blocked = active.some((id, i) => wanted[i] !== id) || active.length >= wanted.length;
      }
      const occurred = new RegExp(`\\^a-${e.id.replace(/^p-/, "")}-\\d+\\b`).test(text);
      const active = [...state.mainChain, ...state.contexts].some(a => actualPlanSlug(a) === e.id.replace(/^p-/, ""));
      const missed = !occurred && !active && e.start < nowHHMM;
      row.appendChild(button(occurred ? "Resume" : missed ? "Start late" : "Start", async () => { try { await write(text, SB.startBlock(text, e)); } catch (x) { new Notice(x.message); } }, blocked || active));
      if (missed) row.appendChild(button("Dismiss", async () => { try { await write(text, SB.dismissBlock(text, e)); } catch (x) { new Notice(x.message); } }));
      const scheduledProgress = e.role === "context" && e.end ? SB.progressFor(e, null, new Date()) : null;
      if (scheduledProgress) { const bar = card.createDiv({ cls: "sb-progress" }); const fill = bar.createEl("i"); fill.style.width = `${scheduledProgress.percent}%`; }
    }
    const tools = root.createEl("div", { cls: "sb-row" });
    tools.appendChild(button("New context", async () => {
      const body = await textPicker("Unplanned context description"); if (!body) return;
      const id = `a-context-${Date.now().toString(36)}`;
      await write(text, SB.appendActual(text, `- ${SB.hhmm(new Date())}- ${body} ^${id}`));
    }));
  }
  await render();
} catch (error) {
  dv.el("div", error.stack || error.message, { cls: "sb-error" });
}
})(globalThis.__scheduleRunnerEntry);

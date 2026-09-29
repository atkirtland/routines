const assert = require("assert");
const path = require("path");
const R = require(path.join(__dirname, "..", "routine-runner.js"));
const E = require(path.join(__dirname, "..", "routine-runner-embed.js"));

// Task pause counts as unassigned time; runner pause excludes breaks and
// preserves the task's previous running/paused state across serialization.
{
  const timing = {};
  const session = { startedAt: 1000, elapsedBeforeStartMs: 0 };
  E.setRunnerMode(timing, "task", 1000);
  E.toggleRunnerPause(timing, session, 4000);
  assert.equal(session.startedAt, null);
  assert.equal(session.elapsedBeforeStartMs, 3000);
  assert.deepEqual(E.runnerTotals(timing, 9000), { elapsedMs: 3000, unassignedMs: 0 });
  const restored = E.deserializeSession(E.serializeSession({ timing, sessions: { task: session } }));
  E.toggleRunnerPause(restored.timing, restored.sessions.task, 10000);
  assert.equal(restored.sessions.task.startedAt, 10000);
  E.setRunnerMode(restored.timing, "unassigned", 12000);
  restored.sessions.task.startedAt = null;
  E.toggleRunnerPause(restored.timing, restored.sessions.task, 15000);
  E.toggleRunnerPause(restored.timing, restored.sessions.task, 20000);
  assert.equal(restored.sessions.task.startedAt, null);
  assert.equal(restored.timing.mode, "unassigned");
  E.setRunnerMode(restored.timing, "stopped", 22000);
  assert.deepEqual(E.runnerTotals(restored.timing, 30000), { elapsedMs: 10000, unassignedMs: 5000 });
}

assert.equal(R.parseEstimateMs("Stretch"), 0);
assert.equal(R.parseEstimateMs("Stretch ⏱️ 10:05"), 605000);
assert.equal(R.parseEstimateMs("Long ⏱️ 1:02:03"), 3723000);
assert.equal(R.parseEstimateMs("Custom", 42000), 42000);
assert.equal(R.parseGoalCount("Push-ups 🎯 20"), 20);
assert.equal(R.parseGoalCount("Push-ups"), null);
assert.equal(R.parseRoutineText("- [ ] Visible label ^native-block-id\n").tasks[0].display, "Visible label");
assert.equal(R.parseRoutineText("- [ ] 中文任务 ^任務-1\n").tasks[0].display, "中文任务");
const createdDateSource = "- [ ] 記錄夢 🏁 15:15 ➕ 2026-09-27 ✅ 2026-09-27 ^dream";
const createdDateTask = R.parseRoutineText(createdDateSource).tasks[0];
assert.equal(createdDateTask.display, "記錄夢");
assert.equal(createdDateTask.sourceLine, createdDateSource);
assert.equal(E.model(createdDateSource, 0).root.display, createdDateTask.display);
assert.equal(R.parseRoutineText("- [ ] Task ➕️ 2026-09-27").tasks[0].display, "Task");
assert.equal(R.taskDisplay("- [x] Run #fitness [🏁 5:00, 🥅 3] 📅 2026-09-28 ^run"), "Run #fitness");
assert.equal(R.taskDisplay("- [ ] Stretch ⏱️ 10:05 🎯 20 -- felt stiff"), "Stretch");
assert.equal(R.taskDisplay("- [ ] Water 🔁 every day when done ⏫ 🆔 abc ⛔ x,y"), "Water");
assert.equal(R.taskDisplay("- [ ] Read [🍎](https://example.com) now"), "Read [🍎](https://example.com) now");
assert.equal(R.taskDisplay("- [ ] Eat fish ^961371"), "Eat fish");
assert.equal(R.taskDisplay("  - [x] 中文任务 #t/p ^任務-1"), "中文任务 #t/p");
assert.equal(R.taskDisplay("- Plain list item"), "Plain list item");
// Completing a task must not change its label, or run keys stop matching.
assert.equal(R.taskDisplay("- [x] Push-ups 🎯 20 🏁 1:05 🥅 18 ✅ 2026-09-29"), R.taskDisplay("- [ ] Push-ups 🎯 20"));
assert.equal(R.normalizeTaskKey("Plan ➕ 2026-09-27\u0000Fix [🏁 0:07] ✅ 2026-09-27"), "Plan\u0000Fix");
assert.equal(R.formatDuration(65000), "1:05");
assert.equal(R.formatDuration(-3723000), "-1:02:03");

assert.equal(
  R.insertBeforeTasksMetadata("- [ ] Run #fitness 📅 2026-09-28", "🏁 5:00"),
  "- [ ] Run #fitness 🏁 5:00 📅 2026-09-28"
);

const parsed = R.parseRoutineText(`# Morning
- [ ] Parent ⏱️ 10:00
  - [ ] Child 🎯 3
  - [x] Finished
## Later
- [ ] Other
`);
assert.deepEqual(parsed.headings.map(h => [h.level, h.text]), [[1, "Morning"], [2, "Later"]]);
assert.equal(parsed.tasks.length, 4);
assert.equal(parsed.tasks[1].parentId, parsed.tasks[0].id);
assert.deepEqual(parsed.tasks[1].displayPath, ["Parent", "Child"]);
assert.equal(parsed.tasks[0].estimateMs, 600000);
assert.equal(parsed.tasks[1].goalCount, 3);
assert.equal(parsed.tasks[2].checked, true);
assert.deepEqual(R.sectionLineRange(parsed.headings, parsed.totalLines, 0), { start: 1, end: parsed.totalLines });
assert.deepEqual(R.sectionLineRange(parsed.headings, parsed.totalLines, 1), { start: 5, end: parsed.totalLines });

const roots = parsed.tasks.filter(task => !task.parentId);
assert.deepEqual(R.enabledLeaves(roots).map(task => task.display), ["Child", "Finished", "Other"]);
parsed.tasks[0].selected = false;
assert.deepEqual(R.enabledLeaves(roots).map(task => task.display), ["Other"]);
assert.equal(R.selectedRoutineTree(roots).length, 1);
assert(R.fuzzyScore("prnt", "Parent") >= 0);
assert.equal(R.fuzzyScore("xyz", "Parent"), -1);
assert.equal(R.elapsedForSession({ elapsedBeforeStartMs: 1000, startedAt: 5000 }, 8000), 4000);
assert.equal(R.elapsedForSession({ elapsedBeforeStartMs: undefined, startedAt: "5000" }, 8000), 3000);
assert.equal(R.elapsedForSession({ elapsedBeforeStartMs: "1000", startedAt: null }, 8000), 1000);

const embedded = E.model(`# Before
- [ ] Morning routine ^morning-routine
  - [ ] Make bed
  - [ ] Breakfast
    - [ ] Eat fruit
- [ ] Unrelated
`, 1, 4);
assert.equal(embedded.root.display, "Morning routine");
assert.equal(embedded.focus.display, "Eat fruit");
assert.deepEqual(embedded.path.map(task => task.display), ["Morning routine", "Breakfast", "Eat fruit"]);
assert.deepEqual(embedded.leaves.map(task => task.display), ["Make bed", "Eat fruit"]);
assert.equal(embedded.hasIncompleteDescendants, true);
assert.equal(E.model("- [ ] Root\n  - [ ] Child\n", 0, 99).focus.display, "Root");
assert.deepEqual(
  E.openSelectionTree({ display: "Root", checked: false, children: [
    { display: "記錄夢 🏁 0:07 ✅ 2026-09-27", checked: true, children: [] },
    { display: "Open", checked: false, children: [] },
  ] }).children.map(task => task.display),
  ["Open"]
);
assert.equal(E.replacementForTask("  - [ ] Child", null), "  - [x] Child");
assert.equal(E.replacementForTask("- [ ] Child", "- [x] Child ✅ 2026-09-27"), "- [x] Child ✅ 2026-09-27");
assert.deepEqual(E.createRunState(), { focusKey: null, activeLeafKey: null, retired: [], sessions: {}, completedCount: 0, processedCount: 0, runTree: [], initialRunTree: [], actionHistory: [] });
assert.equal(E.lineForKey(`intro\n- [ ] Morning routine ^morning-routine\n  - [ ] Make bed\n  - [ ] Breakfast\n`, 1, "Morning routine\u0000Breakfast"), 3);
assert.equal(E.lineForKey(`new line\nintro\n- [ ] Morning routine ^morning-routine\n  - [ ] Make bed\n  - [ ] Breakfast\n`, 2, "Morning routine\u0000Breakfast"), 4);

console.log("routine-runner: all tests passed");

const commentSource = "  - [ ] 記錄夢 #daily/dream 📅 2026-09-29 [💬 message,⭐ other] ^dream";
const commented = R.withTaskComment(commentSource, "Remembered a forest");
assert.equal(commented, "  - [ ] 記錄夢 -- Remembered a forest #daily/dream 📅 2026-09-29 [💬 message,⭐ other] ^dream");
assert.equal(R.withTaskComment(commented, "Updated"), commented.replace("Remembered a forest", "Updated"));
assert.equal(R.withTaskComment(commented, ""), commentSource);
assert.equal(R.withTaskComment("- [ ] Task ^task", "one\ntwo"), "- [ ] Task -- one two ^task");
assert.equal(R.withTaskComment("- [ ] Task [💬 message]", "note"), "- [ ] Task -- note [💬 message]");
assert.equal(R.parseRoutineText(commented).tasks[0].display, R.parseRoutineText(commentSource).tasks[0].display);
assert.equal(R.parseRoutineText(commented).tasks[0].comment, "Remembered a forest");

(async () => {
  let content = "Intro\n" + commentSource;
  let writes = 0;
  const app = { vault: { read: async () => content, modify: async (_file, value) => { content = value; writes++; } } };
  const task = R.parseRoutineText(commentSource).tasks[0];
  Object.assign(task, await E.saveTaskComment(app, { path: "Tasks.md" }, task, "First"));
  assert.equal(task.line, 1);
  Object.assign(task, await E.saveTaskComment(app, { path: "Tasks.md" }, task, "Second"));
  assert(content.includes("-- Second #daily/dream"));
  const beforeCompletion = content;
  const completed = await E.completeTaskTransaction(app, { path: "Tasks.md" }, content, task.line, null, { elapsedMs: 7000 });
  assert(content.includes("-- Second"));
  assert(content.includes("🏁 0:07"));
  assert.deepEqual(E.undoReplacements(content, [completed.undo]), { ok: true, content: beforeCompletion });
  assert.equal(E.undoReplacements(content.replace("🏁 0:07", "🏁 edited"), [completed.undo]).ok, false);
  content = "Other\n" + commentSource + "\n" + commentSource;
  const stale = { ...task, line: 0, sourceLine: commentSource };
  const previousWrites = writes;
  await assert.rejects(E.saveTaskComment(app, { path: "Tasks.md" }, stale, "Unsafe"), /ambiguous/);
  assert.equal(writes, previousWrites);
  class Element {
    constructor(options = {}) { Object.assign(this, options); this.children = []; this.events = {}; this.style = {}; this.classList = { toggle() {} }; }
    createDiv(options) { return this.createEl("div", options); }
    addClass(value) { this.cls = this.cls ? `${this.cls} ${value}` : value; }
    setAttribute() {}
    querySelector() { return null; }
    empty() { this.children = []; }
    createSpan(options) { return this.createEl("span", options); }
    createEl(tag, options) { const child = new Element({ tag, ...options }); this.children.push(child); return child; }
    addEventListener(name, handler) { this.events[name] = handler; }
    removeEventListener(name) { delete this.events[name]; }
    getBoundingClientRect() { return { left: 10, bottom: 20, width: 200, height: 100 }; }
    focus() {}
    remove() { this.removed = true; }
  }
  const container = new Element();
  const doc = new Element(); doc.body = new Element();
  global.document = doc; global.innerWidth = 1000; global.innerHeight = 800;
  const parent = { ...task, id: "parent", line: 99, display: "Parent", comment: "Parent comment" };
  let savedComment, savedTask;
  const view = E.renderRunCard(container, {
    task, path: [parent, task], session: { startedAt: null, elapsedBeforeStartMs: 7000 },
    onComment: async (node, value) => { savedTask = node; savedComment = value; },
  });
  try {
    const elements = node => [node, ...node.children.flatMap(elements)];
    assert(!elements(container).some(node => node.cls === "rr-task-queue"), "run card should not render the removed breadcrumb queue");
    assert(!elements(container).some(node => node.tag === "input"));
    const crumbs = elements(container).filter(node => node.events.contextmenu && node.text);
    const contextEvent = { preventDefault() {}, stopPropagation() {} };
    crumbs[1].events.contextmenu(contextEvent);
    const nodes = elements(doc.body);
    const input = nodes.find(node => node.tag === "input");
    const save = nodes.find(node => node.text === "Save comment");
    assert.equal(input.value, "Second");
    input.value = "UI comment";
    await save.events.click();
    assert.equal(savedComment, "UI comment");
    assert.equal(savedTask, task);
    assert(nodes.some(node => node.textContent === "Comment saved"));
    assert.equal(save.disabled, false);
    crumbs[0].events.contextmenu(contextEvent);
    const parentMenu = doc.body.children.at(-1);
    const parentInput = elements(parentMenu).find(node => node.tag === "input");
    assert.equal(parentInput.value, "Parent comment");
    parentInput.value = "For ancestor";
    await elements(parentMenu).find(node => node.text === "Save comment").events.click();
    assert.equal(savedTask, parent);
    doc.events.keydown({ key: "Escape", preventDefault() {} });
    assert(parentMenu.removed);

    // Run tree: tasks checked in the note and skipped tasks are greyed, and
    // only actions from this run offer Undo.
    const runContent = "- [ ] Routine ^r\n  - [x] Old [🏁 1:00] ✅ 2026-09-28\n  - [ ] First\n  - [ ] Second\n";
    const runState = E.createRunState(); runState.screen = "run";
    const runBox = new Element();
    let runView;
    const runOptions = { content: runContent, rootLine: 0, state: runState, onRefresh: () => { runView?.dispose(); runView = E.renderRunner(runBox, runOptions); } };
    runOptions.onRefresh();
    const rowFor = label => elements(runBox).find(node => node.cls?.startsWith("rr-review-item") && elements(node).some(child => child.text === label));
    assert(rowFor("Old").cls.includes("rr-review-item-processed"));
    assert(!elements(runBox).some(node => node.text === "↶ Undo"));
    elements(runBox).find(node => node.text === "Skip").events.click();
    assert(rowFor("First").cls.includes("rr-review-item-processed"));
    assert(rowFor("Second").cls.includes("rr-review-item-current"));
    const undo = elements(rowFor("First")).find(node => node.text === "↶ Undo");
    assert.equal(undo.attr.title, "Undo — reopen this task");
    await undo.events.click({ stopPropagation() {} });
    assert.equal(runState.activeLeafKey, "Routine\u0000First");
    assert.deepEqual(runState.actionHistory, []);
    runView.dispose();
  } finally { view.dispose(); delete global.document; delete global.innerWidth; delete global.innerHeight; }
  console.log("routine-runner: comment persistence tests passed");
})().catch(error => { console.error(error); process.exitCode = 1; });

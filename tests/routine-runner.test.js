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

// Parent roll-ups include descendant task sessions, direct parent work, and
// unassigned time recorded while any task in that subtree was paused.
{
  const child = { id: "child", children: [] };
  const parent = { id: "parent", children: [child] };
  const rollup = {
    sessions: {
      child: { elapsedBeforeStartMs: 3000, startedAt: null },
      parent: { elapsedBeforeStartMs: 2000, startedAt: null },
    },
    timing: { mode: "stopped", unassignedByTask: { child: 4000, elsewhere: 9000 } },
  };
  assert.equal(E.subtreeElapsedTotal(rollup, parent, node => node.id, 10000), 9000);
  assert.equal(E.subtreeElapsedTotal(rollup, child, node => node.id, 10000), 7000);
  const active = { sessions: { child: { elapsedBeforeStartMs: 3000, startedAt: null } }, timing: {} };
  E.setRunnerMode(active.timing, "unassigned", 1000, "child");
  assert.equal(E.subtreeElapsedTotal(active, child, node => node.id, 5000), 7000);
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
assert.equal(R.taskDisplay("- [x] Task 🕐 17:42:31-04:00 ➕ 2026-10-02 ✅ 2026-10-02"), "Task");
assert.equal(R.normalizeTaskKey("Task 🕐 17:42:31-04:00 ✅ 2026-10-02"), "Task");
assert.equal(R.taskDisplay("  - [x] 中文任务 #t/p ^任務-1"), "中文任务 #t/p");
assert.equal(R.taskDisplay("- Plain list item"), "Plain list item");
// Completing a task must not change its label, or run keys stop matching.
assert.equal(R.taskDisplay("- [x] Push-ups 🎯 20 🏁 1:05 🥅 18 ✅ 2026-09-29"), R.taskDisplay("- [ ] Push-ups 🎯 20"));
assert.equal(R.normalizeTaskKey("Plan ➕ 2026-09-27\u0000Fix [🏁 0:07] ✅ 2026-09-27"), "Plan\u0000Fix");
assert.equal(R.formatDuration(65000), "1:05");
assert.equal(R.formatDuration(-3723000), "-1:02:03");
assert.equal(E.crossedPlannedDuration(9999, 10000, 10000), true);
assert.equal(E.crossedPlannedDuration(10000, 11000, 10000), false);
assert.equal(E.crossedPlannedDuration(9000, 9999, 10000), false);
assert.equal(E.crossedPlannedDuration(-1, 0, 0), false);

const fakeInstant = (offset, hour = 17, date = 2) => ({
  getTimezoneOffset: () => offset, getFullYear: () => 2026, getMonth: () => 9,
  getDate: () => date, getHours: () => hour, getMinutes: () => 42, getSeconds: () => 31,
});
assert.deepEqual(E.localLifecycleParts(fakeInstant(240)), { date: "2026-10-02", time: "17:42:31-04:00" });
assert.equal(E.localLifecycleParts(fakeInstant(-330)).time, "17:42:31+05:30");
assert.equal(E.localLifecycleParts(fakeInstant(0)).time, "17:42:31Z");
assert.deepEqual(E.localLifecycleParts(fakeInstant(-60, 0, 3)), { date: "2026-10-03", time: "00:42:31+01:00" });
assert.equal(E.stampLifecycleTime("- [x] Task ➕ 2026-10-02 ✅ 2026-10-02", "DONE", "17:42:31-04:00"), "- [x] Task 🕐 17:42:31-04:00 ➕ 2026-10-02 ✅ 2026-10-02");
assert.equal(E.stampLifecycleTime("- [x] Task 🕐 01:02:03Z ✅ 2026-10-02", "DONE", "17:42:31-04:00"), "- [x] Task 🕐 17:42:31-04:00 ✅ 2026-10-02");
assert.equal(E.stampLifecycleTime("- [x] Task", "DONE", "17:42:31-04:00"), "- [x] Task");
assert.equal(E.stampLifecycleTime("- [x] Task 🕐 01:02:03Z", "DONE", "17:42:31-04:00"), "- [x] Task");

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

const structuralTree = R.parseRoutineText(`- [ ] Routine
  - Morning
    - [ ] Coffee
    - Notes
      - [x] Journal
  - [ ] Outside
`);
assert.equal(structuralTree.tasks.length, 6);
assert.equal(structuralTree.tasks[1].checkable, false);
assert.equal(structuralTree.tasks[2].parentId, structuralTree.tasks[1].id);
assert.deepEqual(R.enabledLeaves(structuralTree.tasks.filter(node => !node.parentId)).map(node => node.display), ["Coffee", "Journal", "Outside"]);
assert.deepEqual(
  R.taskBearingTree(R.parseRoutineText(`- Unrelated root list
- Group with tasks
  - Plain note
  - Nested group
    - [ ] Kept task
- [ ] Root task
`).tasks.filter(node => !node.parentId)).map(node => [node.display, node.children.map(child => child.display)]),
  [["Group with tasks", ["Nested group"]], ["Root task", []]],
  "plain list branches appear only when they lead to a task"
);
assert.deepEqual(R.readyParents(structuralTree.tasks.filter(node => !node.parentId)).map(node => node.display), []);
structuralTree.tasks.find(node => node.display === "Coffee").checked = true;
structuralTree.tasks.find(node => node.display === "Outside").checked = true;
assert.deepEqual(R.readyParents(structuralTree.tasks.filter(node => !node.parentId)).map(node => node.display), ["Routine"]);

const statusTree = R.parseRoutineText(`- [ ] Grandparent
  - [ ] Parent
    - [x] Done
    - [-] Cancelled
  - [/] In progress
`).tasks.filter(task => !task.parentId);
assert.deepEqual(R.readyParents(statusTree).map(task => task.display), ["Parent"]);
statusTree[0].children[0].checked = true;
assert.deepEqual(R.readyParents(statusTree).map(task => task.display), ["Grandparent"]);

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
    { display: "Unrelated list", checkable: false, checked: false, children: [] },
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
  {
    let recurring = "- [ ] Repeat 🔁 every day";
    const recurringApp = { plugins: { plugins: { "obsidian-tasks-plugin": {
      apiV1: { executeToggleTaskDoneCommand: () => "- [x] Repeat 🔁 every day ✅ 2026-10-02\n- [ ] Repeat 🔁 every day 📅 2026-10-03" },
    } } }, vault: { modify: async (_file, value) => { recurring = value; } } };
    const transaction = await E.completeTaskTransaction(recurringApp, { path: "Tasks.md" }, recurring, 0, null, null, fakeInstant(240));
    assert.equal(transaction.content, "- [x] Repeat 🕐 17:42:31-04:00 🔁 every day ✅ 2026-10-02\n- [ ] Repeat 🔁 every day 📅 2026-10-03");
    assert.equal(transaction.undo.afterLines.length, 2, "recurrence undo includes both occurrences");
  }
  {
    let content = "- [ ] Cancel";
    const noCancelledDate = { plugins: { plugins: { "obsidian-tasks-plugin": { loadData: async () => ({ setCancelledDate: false }) } } }, vault: { modify: async (_file, value) => { content = value; } } };
    await E.completeTaskTransaction(noCancelledDate, { path: "Tasks.md" }, content, 0,
      { symbol: "-", type: "CANCELLED" }, null, fakeInstant(-330));
    assert.equal(content, "- [-] Cancel", "cancel without its configured date has no lifecycle time");
  }
  {
    let content = "- [ ] Cancel";
    const cancelledDate = { plugins: { plugins: { "obsidian-tasks-plugin": { loadData: async () => ({ setCancelledDate: true }) } } }, vault: { modify: async (_file, value) => { content = value; } } };
    await E.completeTaskTransaction(cancelledDate, { path: "Tasks.md" }, content, 0,
      { symbol: "-", type: "CANCELLED" }, null, fakeInstant(-330));
    assert.equal(content, "- [-] Cancel 🕐 17:42:31+05:30 ❌ 2026-10-02");
  }
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

  content = "# Routine\n- [ ] Parent\n  - [ ] A\n    - [ ] A child\n  - [ ] B\n\nNotes";
  let parsed = R.parseRoutineText(content);
  await E.moveTask(app, { path: "Tasks.md" }, parsed.tasks.find(node => node.display === "B"), -1);
  assert.equal(content, "# Routine\n- [ ] Parent\n  - [ ] B\n  - [ ] A\n    - [ ] A child\n\nNotes", "moving a task moves its subtree and persists sibling order");
  parsed = R.parseRoutineText(content);
  const addedSibling = await E.addTaskAfter(app, { path: "Tasks.md" }, parsed.tasks.find(node => node.display === "B"), "New sibling ⏱️ 0:05");
  assert.equal(addedSibling.task.sourceLine, "  - [ ] New sibling ⏱️ 0:05");
  assert.match(content, /  - \[ \] B\n  - \[ \] New sibling ⏱️ 0:05\n  - \[ \] A/);
  parsed = R.parseRoutineText(content);
  await E.addTaskAfter(app, { path: "Tasks.md" }, parsed.tasks.find(node => node.display === "Parent"), "New child", true);
  assert.match(content, /    - \[ \] A child\n  - \[ \] New child\n\nNotes$/, "embedded-root additions stay inside the linked subtree");
  parsed = R.parseRoutineText(content);
  const estimateUpdate = await E.updateTaskEstimate(app, { path: "Tasks.md" }, parsed.tasks.find(node => node.display === "New sibling"), 90000);
  assert.match(estimateUpdate.sourceLine, /⏱️ 1:30/);
  assert.equal(R.parseRoutineText(content).tasks.find(node => node.display === "New sibling").estimateMs, 90000);
  parsed = R.parseRoutineText(content);
  const checked = await E.checkTask(app, { path: "Tasks.md" }, parsed.tasks.find(node => node.display === "New sibling"));
  assert.equal(checked.checked, true);
  assert.match(checked.sourceLine, /^  - \[x\] New sibling/);
  assert.match(checked.undo.beforeLines[0], /^  - \[ \] New sibling/);
  parsed = R.parseRoutineText(content);
  const cancelled = await E.checkTask(app, { path: "Tasks.md" }, parsed.tasks.find(node => node.display === "New child"), { symbol: "-", name: "Cancelled", type: "CANCELLED" });
  assert.match(cancelled.sourceLine, /^  - \[-\] New child/);
  assert.match(cancelled.sourceLine, /🕐 \d{2}:\d{2}:\d{2}(?:Z|[+-]\d{2}:\d{2}) ❌ \d{4}-\d{2}-\d{2}/, "task-tree cancellation receives lifecycle date and time");
  {
    let treeContent = "- [ ] Tree done";
    const treeApp = { plugins: { plugins: { "obsidian-tasks-plugin": {
      loadData: async () => ({ setDoneDate: true }),
    } } }, vault: { read: async () => treeContent, modify: async (_file, value) => { treeContent = value; } } };
    const treeDone = await E.checkTask(treeApp, { path: "Tasks.md" }, R.parseRoutineText(treeContent).tasks[0], null, fakeInstant(240));
    assert.equal(treeDone.sourceLine, "- [x] Tree done 🕐 17:42:31-04:00 ✅ 2026-10-02", "task-tree Done uses the lifecycle transaction");
  }
  parsed = R.parseRoutineText(content);
  await E.deleteTask(app, { path: "Tasks.md" }, parsed.tasks.find(node => node.display === "A"));
  assert.doesNotMatch(content, /A child/, "deleting a parent removes its complete subtree");
  assert.match(content, /New sibling/);

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
  const alertSession = { startedAt: null, elapsedBeforeStartMs: 9999 };
  let alerts = 0;
  const alertView = E.renderRunCard(new Element(), {
    task: { ...task, estimateMs: 10000 }, path: [task], session: alertSession,
    onDurationEnd: () => { alerts++; },
  });
  try {
    alertSession.elapsedBeforeStartMs = 10000;
    alertView.repaint();
    alertView.repaint();
    assert.equal(alerts, 1, "planned-duration sound fires once at the boundary");
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
  } finally { alertView.dispose(); view.dispose(); delete global.document; delete global.innerWidth; delete global.innerHeight; }
  console.log("routine-runner: comment persistence tests passed");
})().catch(error => { console.error(error); process.exitCode = 1; });

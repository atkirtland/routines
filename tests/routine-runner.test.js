const assert = require("assert");
const path = require("path");
const R = require(path.join(__dirname, "..", "routine-runner.js"));
const E = require(path.join(__dirname, "..", "routine-runner-embed.js"));

assert.equal(R.parseEstimateMs("Stretch"), 0);
assert.equal(R.parseEstimateMs("Stretch ⏱️ 10:05"), 605000);
assert.equal(R.parseEstimateMs("Long ⏱️ 1:02:03"), 3723000);
assert.equal(R.parseEstimateMs("Custom", 42000), 42000);
assert.equal(R.parseGoalCount("Push-ups 🎯 20"), 20);
assert.equal(R.parseGoalCount("Push-ups"), null);
assert.equal(R.parseRoutineText("- [ ] Visible label ^native-block-id\n").tasks[0].display, "Visible label");
assert.equal(R.parseRoutineText("- [ ] 中文任务 ^任務-1\n").tasks[0].display, "中文任务");
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
assert.deepEqual(E.createRunState(), { focusKey: null, activeLeafKey: null, retired: [], sessions: {}, completedCount: 0, processedCount: 0 });
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
  await E.completeTask(app, { path: "Tasks.md" }, content, task.line, null, { elapsedMs: 7000 });
  assert(content.includes("-- Second"));
  assert(content.includes("🏁 0:07"));
  content = "Other\n" + commentSource + "\n" + commentSource;
  const stale = { ...task, line: 0, sourceLine: commentSource };
  const previousWrites = writes;
  await assert.rejects(E.saveTaskComment(app, { path: "Tasks.md" }, stale, "Unsafe"), /ambiguous/);
  assert.equal(writes, previousWrites);
  class Element {
    constructor(options = {}) { Object.assign(this, options); this.children = []; this.events = {}; this.style = {}; this.classList = { toggle() {} }; }
    createDiv(options) { return this.createEl("div", options); }
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
  } finally { view.dispose(); delete global.document; delete global.innerWidth; delete global.innerHeight; }
  console.log("routine-runner: comment persistence tests passed");
})().catch(error => { console.error(error); process.exitCode = 1; });

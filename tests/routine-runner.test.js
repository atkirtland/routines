const assert = require("assert");
const path = require("path");
const R = require(path.join(__dirname, "..", "routine-runner.js"));
const E = require(path.join(__dirname, "..", "routine-runner-embed.js"));

assert.equal(R.parseEstimateMs("Stretch"), 300000);
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
assert.equal(E.replacementForTask("  - [ ] Child", null), "  - [x] Child");
assert.equal(E.replacementForTask("- [ ] Child", "- [x] Child ✅ 2026-09-27"), "- [x] Child ✅ 2026-09-27");
assert.deepEqual(E.createRunState(), { focusKey: null, activeLeafKey: null, retired: [], sessions: {}, completedCount: 0, processedCount: 0 });
assert.equal(E.lineForKey(`intro\n- [ ] Morning routine ^morning-routine\n  - [ ] Make bed\n  - [ ] Breakfast\n`, 1, "Morning routine\u0000Breakfast"), 3);
assert.equal(E.lineForKey(`new line\nintro\n- [ ] Morning routine ^morning-routine\n  - [ ] Make bed\n  - [ ] Breakfast\n`, 2, "Morning routine\u0000Breakfast"), 4);

console.log("routine-runner: all tests passed");

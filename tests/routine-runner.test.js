const assert = require("assert");
const path = require("path");
const R = require(path.join(__dirname, "..", "routine-runner.js"));

assert.equal(R.parseEstimateMs("Stretch"), 300000);
assert.equal(R.parseEstimateMs("Stretch ⏱️ 10:05"), 605000);
assert.equal(R.parseEstimateMs("Long ⏱️ 1:02:03"), 3723000);
assert.equal(R.parseEstimateMs("Custom", 42000), 42000);
assert.equal(R.parseGoalCount("Push-ups 🎯 20"), 20);
assert.equal(R.parseGoalCount("Push-ups"), null);
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

console.log("routine-runner: all tests passed");

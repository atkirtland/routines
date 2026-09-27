const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const loadFresh = () => {
  const filename = require.resolve(path.join(root, "schedule-runner.js"));
  delete require.cache[filename];
  return require(filename);
};

// A persisted Daily Note, not an in-memory runner cache, is sufficient to
// reconstruct running state after a rerender/reload/cache deletion.
let S = loadFresh();
const planText = `## Plan
- 0900 Parent ^p-parent
  - 0910 +25m Child ^p-child
- 0930-1030 Coworking ^p-coworking
`;
const plan = S.parseSection(planText, "Plan");
let persisted = S.startBlock(planText, plan.entries[1], new Date("2026-09-27T09:12:00Z"));
persisted = S.startBlock(persisted, plan.entries[2], new Date("2026-09-27T09:14:00Z"));
assert.deepEqual(S.actualState(persisted).mainChain.map(x => x.body), ["Parent", "Child"]);
assert.equal(S.actualState(persisted).contexts.length, 1);
S = loadFresh();
assert.deepEqual(S.actualState(persisted).mainChain.map(x => x.body), ["Parent", "Child"]);
assert.equal(S.actualState(persisted).contexts[0].body, "Coworking");

// Guarded undo tolerates unrelated edits outside its generated slice, but
// refuses to remove a generated slice that was manually changed.
const before = "top\nold\nbottom", after = "top\ngenerated\nbottom";
const record = { start: 1, beforeLines: ["old"], afterLines: ["generated"] };
assert.equal(S.replaceIfUnchanged(`unrelated\n${after}`, { ...record, start: 2 }).text, `unrelated\n${before}`);
assert.equal(S.replaceIfUnchanged("top\nchanged\nbottom", record).ok, false);

// Both DataviewJS documents remain syntactically compilable. Schedule Runner's
// note stays a thin entry point; its UI adapter is ordinary JavaScript.
const compileDataview = filename => {
  const source = fs.readFileSync(path.join(root, filename), "utf8");
  const match = source.match(/```dataviewjs\n([\s\S]*?)\n```/);
  assert(match, `${filename} has a DataviewJS fence`);
  new Function("dv", "app", "moment", "Notice", `return (async()=>{${match[1]}\n})()`);
  return source;
};
const scheduleSource = compileDataview("schedule-runner.md");
assert.match(scheduleSource, /schedule-runner-ui\.js/);
assert(!scheduleSource.includes("function render("), "Schedule Runner UI leaked into its Markdown entry point");
new Function(fs.readFileSync(path.join(root, "schedule-runner-ui.js"), "utf8"));
const scheduleUi = fs.readFileSync(path.join(root, "schedule-runner-ui.js"), "utf8");
assert.match(scheduleUi, /schedule-runner\.js/);
assert.match(scheduleUi, /routine-runner-embed\.js/);
assert.match(scheduleUi, /renderRunner/);
assert.match(scheduleUi, /schedule-runner-state\.yaml/);
assert(!scheduleUi.includes("localStorage"), "Schedule runner state must not share browser-local storage");
assert(!scheduleUi.includes("SB.doneTaskActuals"), "Task Done must not mutate Actual");
const routineSource = compileDataview("routine-runner.md");
assert.match(routineSource, /routine-runner-ui\.js/);
assert(!routineSource.includes("function render("), "Routine Runner UI leaked into its Markdown entry point");
const routineUi = fs.readFileSync(path.join(root, "routine-runner-ui.js"), "utf8");
new Function(routineUi);
assert.match(routineUi, /routine-runner\.js/);
assert.match(routineUi, /routine-runner-embed\.js/);
assert.match(routineUi, /RRE\.configuredTaskStatuses/);
assert.match(routineUi, /🏁/u);
const routineCore = fs.readFileSync(path.join(root, "routine-runner.js"), "utf8");
assert.match(routineCore, /⏱️/u);

// The browser build installs only its namespaced API when evaluated fresh.
const browser = { globalThis: {} };
browser.globalThis = browser;
vm.runInNewContext(fs.readFileSync(path.join(root, "schedule-runner.js"), "utf8"), browser);
assert(browser.ScheduleRunner);

console.log("schedule-runner integration harness: all tests passed");

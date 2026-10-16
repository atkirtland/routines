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
const sharedRoutineUi = fs.readFileSync(path.join(root, "routine-runner-embed.js"), "utf8");
assert.match(scheduleUi, /schedule-runner\.js/);
assert.match(scheduleUi, /routine-runner-embed\.js/);
assert.match(scheduleUi, /renderRunner/);
assert.match(scheduleUi, /schedule-runner-state\.yaml/);
assert.match(scheduleUi, /await ensureEmbeddedState\(\)/, "An active scheduled task must initialize its separate state file");
assert.match(scheduleUi, /typeof embeddedCoordinator\.actionTail\.then/, "A preserved pre-upgrade coordinator must regain its action queue");
assert.doesNotMatch(scheduleUi, /embeddedRuns\.loaded/, "Every Dataview execution must rehydrate scheduled routine state from YAML");
assert.match(scheduleUi, /const embeddedRuns = \{ states: \{\}, legacy: \{\} \}/, "Scheduled routine session data must not live in the global coordinator");
assert.match(sharedRoutineUi, /renderSelection\(selectionTree, \{/, "Scheduled sessions must use the shared task-selection UI");
assert.match(sharedRoutineUi, /renderRunCard\(container, \{/, "Scheduled sessions must use the shared run-card UI");
assert.match(sharedRoutineUi, /state\.sessions = \{\}/, "Starting a new selected run must not reuse a paused clock from a stopped run");
assert.match(sharedRoutineUi, /summaryActionLabel/, "The shared summary must expose its host-provided action");
assert.match(sharedRoutineUi, /function renderPurgeCacheButton/, "Both hosts must share the purge-cache control");
assert.match(scheduleUi, /delete embeddedRuns\.states\[sessionKey\]/, "Scheduled purge must clear only the corresponding block session");
assert.match(scheduleUi, /file \|\| app\.vault\.getAbstractFileByPath\(dailyPath\)/, "Current-note task links must resolve against the Daily Note");
assert.doesNotMatch(scheduleUi, /text: "Begin tasks"/, "Scheduled tasks must show selection without an intermediate launcher");
assert.match(scheduleUi, /screen: "select"/, "A new scheduled task session must open on the shared selection screen");
assert.match(scheduleUi, /selectionCollapsible: true/, "Scheduled task selection must opt into the collapsible task tree");
assert.match(scheduleUi, /canStart: taskBlockStarted/, "Scheduled tasks must remain disabled until their time block starts");
assert.match(sharedRoutineUi, /options\.canStart === false/, "The shared task launcher must honor a host start guard");
assert.match(sharedRoutineUi, /Show task tree/, "The shared selector must offer a task-tree visibility toggle");
assert.match(sharedRoutineUi, /selectionTree\.hidden = !state\.selectionTreeOpen/, "Scheduled task trees must be hidden by default");
assert.match(sharedRoutineUi, /renderSelectionActions\?\.\(header\)/, "Selection hosts must be able to add inline routine actions");
assert.match(scheduleUi, /renderSelectionActions: header => RRE\.renderPurgeCacheButton\(header, purgeOptions\)/, "Scheduled purge must sit beside the routine selection controls");
assert.match(scheduleUi, /summaryActionLabel: "Back to task selection"/, "A scheduled summary must return to task selection");
assert.match(scheduleUi, /resetRunState\("select"\)/, "Leaving a scheduled summary must reset it to task selection");
assert.doesNotMatch(scheduleUi, /includeCompleted: true/, "Scheduled selection must filter completed leaves like standalone Routine Runner");
assert.doesNotMatch(scheduleUi, /Dismiss|dismissBlock|dismissedPlanIds/, "Block selection must not offer or persist dismissal");
assert.match(scheduleUi, /Upcoming \/ active blocks/, "Upcoming choices must be shown first");
assert.match(scheduleUi, /Earlier blocks/, "Past unstarted choices must move below upcoming choices");
assert.match(sharedRoutineUi, /style\.textContent = SHARED_CSS/, "Reloading either host must refresh the shared runner CSS");
assert(!scheduleUi.includes("localStorage"), "Schedule runner state must not share browser-local storage");
assert(!scheduleUi.includes("SB.doneTaskActuals"), "Task Done must not mutate Actual");
const routineSource = compileDataview("routine-runner.md");
assert.match(routineSource, /routine-runner-ui\.js/);
assert(!routineSource.includes("function render("), "Routine Runner UI leaked into its Markdown entry point");
const routineUi = fs.readFileSync(path.join(root, "routine-runner-ui.js"), "utf8");
new Function(routineUi);
assert.match(routineUi, /await enqueueAction\(resetMissingCache\)/, "Standalone purge must clear its persisted routine state");
assert.match(routineUi, /Routine Runner cache purged/, "Standalone purge must show a success toast");
assert.match(scheduleUi, /Scheduled routine cache purged/, "Scheduled purge must show a success toast");
assert.match(routineUi, /routine-runner\.js/);
assert.match(routineUi, /routine-runner-embed\.js/);
assert.match(sharedRoutineUi, /configuredTaskStatuses/);
assert.match(routineUi, /RRE\.renderRunCard/, "Standalone must use the shared run-card UI");
assert.match(routineUi, /RRE\.renderSelection/, "Standalone must use the shared task-selection UI");
assert.match(routineUi, /🏁/u);
const routineCore = fs.readFileSync(path.join(root, "routine-runner.js"), "utf8");
assert.match(routineCore, /⏱️/u);

// The browser build installs only its namespaced API when evaluated fresh.
const browser = { globalThis: {} };
browser.globalThis = browser;
vm.runInNewContext(fs.readFileSync(path.join(root, "schedule-runner.js"), "utf8"), browser);
assert(browser.ScheduleRunner);

console.log("schedule-runner integration harness: all tests passed");

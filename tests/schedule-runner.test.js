const assert = require("assert");
const path = require("path");
const root = path.join(__dirname, "..");
const S = require(path.join(root, "schedule-runner.js"));

assert.throws(() => S.parseRegistryYaml("projects:\n  w:\n    label: Work\n  w:\n    label: Duplicate\n"), /Duplicate registry key/);

const raw = { version: 1, projects: {
  w: { label: "Work", parents: [], aliases: ["職"] },
  甲: { label: "A", parents: ["w"], aliases: [] },
  p: { label: "Personal", parents: [], aliases: [] },
  運: { label: "Exercise", parents: [], aliases: [] },
}, "exclusive-groups": [["w", "p"]], settings: {} };
const reg = S.validateRegistry(raw); assert.equal(reg.ok, true, reg.errors?.join("\n"));
const state = (a, b) => S.classify(a, b, reg).state;
assert.equal(state("w甲", "w"), "confirmed");
assert.equal(state("w/運", "w運"), "confirmed");
assert.equal(state("w", "w甲"), "unconfirmed");
assert.equal(state("w", "w,p"), "confirmed");
assert.equal(state("w,p", "w"), "unconfirmed");
assert.equal(state(true, "w"), "unconfirmed");
assert.equal(state("p", "w"), "conflict");
assert.equal(state("甲", "w"), "confirmed");
assert.equal(state("職", "w"), "confirmed");
assert.equal(S.classify("x", "w", reg).unknown, true);
assert.equal(state("p運,w", "運"), "unconfirmed");
assert.equal(state("(p,w)運", "運"), "confirmed");
assert.equal(S.resolveTaskClassification("Do it #t/w #t/運", "p"), "(w)/(運)");
assert.equal(S.resolveTaskClassification("Do it", "p"), "p");
assert.equal(S.resolveTaskClassification("Do it", null), true);
assert.deepEqual(S.taskLink("p [[#^morning]]"), { path: "", blockId: "morning" });
assert.deepEqual(S.taskLink("p [[Tasks#^morning|Morning]]"), { path: "Tasks", blockId: "morning" });
assert.equal(S.taskBlockId("p [[#^morning]]"), "morning");
assert.deepEqual(S.taskLinks("p [[#^morning]] [[#^zaoming]]"), [
  { path: "", blockId: "morning" },
  { path: "", blockId: "zaoming" },
]);
assert.deepEqual(S.taskBlockIds("p [[#^morning]] [[Tasks#^zaoming|早]]"), ["morning", "zaoming"]);

assert.equal(S.validateRegistry({ projects: { a: { parents: ["b"] }, b: { parents: ["a"] } }, "exclusive-groups": [] }).ok, false);
assert.equal(S.validateRegistry({ projects: { a: { parents: ["z"] } }, "exclusive-groups": [] }).ok, false);
assert.equal(S.validateRegistry({ projects: { a: { parents: [], aliases: ["x"] }, b: { parents: [], aliases: ["x"] } }, "exclusive-groups": [] }).ok, false);
assert.equal(S.validateRegistry({ projects: { a: { parents: [] } }, "exclusive-groups": [], settings: { "warning-level": "maybe" } }).ok, false);
assert.equal(S.validateRegistry({ projects: { a: { parents: [] } }, "exclusive-groups": [], settings: { "new-scope-style": "dots" } }).ok, false);

let note = `# Day\n\n## Plan\n\n- 1000 w ^p-work\n  - 1000 +25m Pomodoro ^p-pomo\n    - 1000 Task A ^p-task-a\n    - 1010 — ^p-task-a-end\n- 1030-1130 coworking ^p-cowork\n`;
const plan = S.parseSection(note, "Plan");
assert.deepEqual(plan.entries.map(x => x.role), ["main", "main", "main", "boundary", "context"]);
note = S.startBlock(note, plan.entries[2], new Date("2026-09-27T10:04:00Z"));
assert.match(note, /## Actual\n\n- 1004 w/);
let actual = S.actualState(note);
assert.equal(actual.mainChain.length, 3); assert.equal(actual.mainLeaf.body, "Task A");
assert.throws(() => S.startBlock(note, plan.entries[0]), /End the current main leaf/);
assert.throws(() => S.endBlock(note, actual.mainChain[0]), /descendant/);
note = S.endBlock(note, actual.mainLeaf, new Date("2026-09-27T10:16:00Z"));
assert.equal(S.actualState(note).mainLeaf.body, "Pomodoro");
assert.equal(S.completedPlanSlugs(note).has("task-a"), true);
const siblingPlanText = `## Plan\n- 1000 Parent ^p-parent\n  - 1000 First ^p-first\n  - 1010 Second ^p-second\n`;
const siblingPlan = S.parseSection(siblingPlanText, "Plan");
let siblingActual = S.startBlock(siblingPlanText, siblingPlan.entries[1], new Date("2026-09-27T10:00:00Z"));
siblingActual = S.endBlock(siblingActual, S.actualState(siblingActual).mainLeaf, new Date("2026-09-27T10:10:00Z"));
siblingActual = S.startBlock(siblingActual, siblingPlan.entries[2], new Date("2026-09-27T10:10:00Z"));
assert.deepEqual(S.actualState(siblingActual).mainChain.map(x => x.body), ["Parent", "Second"]);
note = S.startBlock(note, plan.entries[4], new Date("2026-09-27T10:33:00Z"));
actual = S.actualState(note); assert.equal(actual.contexts.length, 1);
note = S.endBlock(note, actual.contexts[0], new Date("2026-09-27T11:35:00Z"));
assert.equal(S.actualState(note).contexts.length, 0);
note = S.startBlock(note, plan.entries[4], new Date("2026-09-27T11:40:00Z"));
assert.match(note, /\^a-cowork-2/);
const lines = note.split(/\r?\n/), line = lines.findIndex(x => x.includes("^a-cowork-2"));
const undo = S.replaceIfUnchanged(note, { line, before: null, after: lines[line] });
assert.equal(undo.ok, true); assert.doesNotMatch(undo.text, /\^a-cowork-2/);
assert.equal(S.replaceIfUnchanged(note.replace("cowork-2", "edited"), { line, before: null, after: lines[line] }).ok, false);
const multi = S.replaceIfUnchanged("a\nx\ny\nz", { start: 1, beforeLines: ["b"], afterLines: ["x", "y"] });
assert.deepEqual(multi, { ok: true, text: "a\nb\nz" });
assert.equal(S.replaceIfUnchanged("a\nx\nEDIT\nz", { start: 1, beforeLines: ["b"], afterLines: ["x", "y"] }).ok, false);

const followedActual = `# Day

## Plan
- 0900 Focus ^p-focus

## Actual

## Notes
- keep this after Actual
`;
const followedPlan = S.parseSection(followedActual, "Plan").entries[0];
const followedStarted = S.startBlock(followedActual, followedPlan, new Date("2026-09-27T09:05:00Z"));
assert.match(followedStarted, /## Actual\n\n- 0905 Focus \^a-focus-1\n\n## Notes/);
assert.doesNotMatch(followedStarted, /## Notes[\s\S]*\^a-focus-1/);
assert.equal(S.actualState(followedStarted).mainLeaf.body, "Focus");
const followedEnded = S.endBlock(followedStarted, S.actualState(followedStarted).mainLeaf, new Date("2026-09-27T09:10:00Z"));
assert.match(followedEnded, /## Actual[\s\S]*- 0910 — \^a-focus-1-end\n\n## Notes/);
assert.doesNotMatch(followedEnded, /scheduled-block-ended/);
assert.equal(S.actualState(followedEnded).mainLeaf, null);
assert.equal(S.completedPlanSlugs(followedEnded).has("focus"), true);

const supersededActual = `## Actual
- 1400 p [[#^morning]] ^a-sh31tf66ft-1
- 1655 w ^a-ci5fhwe2xg-1
`;
assert.equal(S.completedPlanSlugs(supersededActual).has("sh31tf66ft"), true);
assert.equal(S.completedPlanSlugs(supersededActual).has("ci5fhwe2xg"), false);

const missingIds = `## Plan\n- 0550 p eat fish\n  - 0600 Task A\n  - 0630 —\n- 0700-0800 coworking\n`;
const repaired = S.ensurePlanIds(missingIds);
assert.equal(repaired.changed, true);
assert.equal(repaired.assigned.length, 4);
assert.match(repaired.text, /- 0550 p eat fish \^p-[a-z0-9]{10}/);
assert.match(repaired.text, /- 0630 — \^p-[a-z0-9]{10}/);
assert.equal(S.ensurePlanIds(repaired.text).changed, false);
const colliding = S.ensurePlanIds(`## Plan\n- 0500 Same\n- 0600 Same\n`);
assert.equal(new Set(S.parseSection(colliding.text, "Plan").entries.map(x => x.id)).size, 2);
assert.equal(S.ensurePlanIds(`## Plan\n- 0500 A ^p-x\n- 0600 B ^p-x\n`).errors.length, 1);
const missingActualIds = `## Actual\n- 1300 p查\n  - 1310 Child\n  - 1320 —\n- 1330- Context\n`;
const repairedActual = S.ensureActualIds(missingActualIds);
assert.equal(repairedActual.changed, true);
assert.equal(repairedActual.assigned.length, 4);
assert.match(repairedActual.text, /- 1300 p查 \^a-[a-z0-9]{10}-1/);
assert.match(repairedActual.text, /- 1310 Child \^a-[a-z0-9]{10}-1/);
const repairedActualEntries = S.parseSection(repairedActual.text, "Actual").entries;
assert.equal(repairedActualEntries[2].id, `${repairedActualEntries[1].id}-end`);
assert.match(repairedActual.text, /- 1330- Context \^a-[a-z0-9]{10}-1/);
assert.equal(S.ensureActualIds(repairedActual.text).changed, false);
assert.throws(() => S.endBlock(missingActualIds, S.actualState(missingActualIds).mainLeaf), /Actual blocks need a block ID/);
const legacyNullEnds = `## Actual\n- 1000 First ^a-first-1\n- 1010 — ^null-end\n- 1020 Second ^a-second-1\n- 1030 — ^null-end\n`;
const repairedLegacy = S.ensureActualIds(legacyNullEnds);
assert.equal(repairedLegacy.errors.length, 0);
assert.match(repairedLegacy.text, /- 1010 — \^a-first-1-end/);
assert.match(repairedLegacy.text, /- 1030 — \^a-second-1-end/);
assert.doesNotMatch(repairedLegacy.text, /\^null-end/);
const legacyOutsideActual = S.ensureActualIds(`## Archive\n- old ^null-end\n- older ^null-end\n`);
assert.equal(legacyOutsideActual.errors.length, 0);
assert.equal(legacyOutsideActual.changed, false);
assert.equal(legacyOutsideActual.text, `## Archive\n- old ^null-end\n- older ^null-end\n`);
const scopedRepairs = `## Notes\n- 0900 untouched\n- duplicate ^same\n- duplicate again ^same\n- legacy ^null-end\n\n## Plan\n- 1000 planned\n\n## Actual\n- 1000 running\n\n## Later\n- 1100 untouched too\n`;
const scopedActual = S.ensureActualIds(scopedRepairs);
assert.match(scopedActual.text, /## Notes\n- 0900 untouched\n- duplicate \^same\n- duplicate again \^same\n- legacy \^null-end/);
assert.match(scopedActual.text, /## Actual\n- 1000 running \^a-[a-z0-9]{10}-1/);
assert.match(scopedActual.text, /## Later\n- 1100 untouched too/);
const scopedPlan = S.ensurePlanIds(scopedActual.text);
assert.equal(scopedPlan.errors.length, 0);
assert.match(scopedPlan.text, /## Plan\n- 1000 planned \^p-[a-z0-9]{10}/);
assert.match(scopedPlan.text, /## Later\n- 1100 untouched too/);
const unrevised = S.parseSection(`## Plan\n- 0900 A ^p-a\n- 1300 B ^p-b\n`, "Plan");
assert.equal(unrevised.revision, null);
assert.deepEqual(unrevised.entries.map(e => e.superseded), [false, false]);
const revised = S.parseSection(`## Plan\n- 0900 A ^p-a\n  - 0930 A1 ^p-a1\n### Replan 1100\n- 1130 B ^p-b\n### Replan 1400 — sick\n  - 1430 C ^p-c\n- 1500 D ^p-d\n## Actual\n- 0900 A ^a-a-1\n`, "Plan");
assert.equal(revised.revision.heading, "Replan 1400 — sick");
assert.deepEqual(revised.entries.map(e => [e.id, e.superseded]), [["p-a", true], ["p-a1", true], ["p-b", true], ["p-c", false], ["p-d", false]]);
assert.equal(revised.entries.find(e => e.id === "p-c").parent, null);
const revisedIds = S.ensurePlanIds(`## Plan\n- 0900 A\n### Replan\n- 1000 B\n`);
assert.equal(new Set(S.parseSection(revisedIds.text, "Plan").entries.map(e => e.id)).size, 2);
const reused = `## Plan\n- 0900 A ^p-a\n- 1300 B ^p-b\n### Replan\n- 1000 B later ^p-b\n  - 1010 B1 ^p-b1\n`;
assert.deepEqual(S.ensurePlanIds(reused).errors, [], "A revision may reuse an earlier revision's ID");
assert.equal(S.ensurePlanIds(`## Plan\n### Replan\n- 1000 B ^p-b\n- 1100 C ^p-b\n`).errors.length, 1, "IDs stay unique within a revision");
const reusedPlan = S.parseSection(reused, "Plan");
assert.equal(S.planEntry(reusedPlan, "p-b").start, "1000", "The current revision wins for a reused ID");
assert.equal(S.planEntry(reusedPlan, "p-a").start, "0900", "Superseded-only IDs still resolve");
assert.equal(S.planEntry(reusedPlan, "p-missing"), null);
const reusedSwitch = S.switchBlock(`${reused}## Actual\n- 0900 A ^a-a-1\n- 0930 B ^a-b-1\n- 0945 A ^a-a-2\n`, S.planEntry(reusedPlan, "p-b1"), new Date("2026-10-21T10:10:00Z"));
assert.match(reusedSwitch, /- 1010 B later \^a-b-2\n  - 1010 B1 \^a-b1-1/, "A reused ID continues its occurrence count");
const inherited = S.parseSection(`## Plan\n- 0500 w Parent\n  - 0510 運 Child\n`, "Plan");
assert.equal(S.inheritedRequirement(inherited.entries[1], reg), "w運");
assert.equal(S.formatExpression("運/w/職", reg), "w/運");
assert.equal(S.formatExpression("運w", reg), "w運");
assert.equal(S.formatExpression("(運,w)/p", reg), "p/(運,w)");
assert.equal(S.shouldShowClassification("confirmed", "conflicts-and-unconfirmed"), false);
assert.equal(S.shouldShowClassification("unconfirmed", "conflicts-and-unconfirmed"), true);
assert.equal(S.shouldShowClassification("conflict", "conflicts-only"), true);
assert.equal(S.shouldShowClassification("unconfirmed", "conflicts-only"), false);
assert.equal(S.scopeToken("eat fish", reg), null);
assert.deepEqual(S.progressFor({ role: "main", duration: 25 }, { start: "1000" }, new Date("2026-09-27T10:10:00Z")),
  { kind: "relative", start: 600, end: 625, elapsed: 10, duration: 25, percent: 40, overrun: 0 });
let editNote = `## Actual\n- 1000 Parent ^a-parent-1\n  - 1010 Child ^a-child-1\n- 1030-1100 Context ^a-context-1\n`;
assert.throws(() => S.editActualTime(editNote, 1, "start", "1015"), /child/i);
editNote = S.editActualTime(editNote, 3, "end", "1115");
assert.match(editNote, /1030-1115/);
const bounded = `## Actual
- 1000 Parent ^a-parent-1
  - 1010 Child ^a-child-1
  - 1030 — ^a-child-1-end
- 1100 — ^a-parent-1-end
`;
assert.equal(S.validateActualIntervals(bounded).ok, true);
assert.throws(() => S.editActualTime(bounded, 1, "start", "1035"), /ends before|child/i);
assert.throws(() => S.editActualTime(bounded, 2, "start", "0955"), /parent/i);
const outsideParent = bounded.replace("  - 1030 —", "  - 1110 —");
assert.equal(S.validateActualIntervals(outsideParent).ok, false);
const donePlan = `## Plan\n- 0900 [[Tasks#^eat|Eat]] ^p-eat\n- 0900-1000 [[Tasks#^eat|Eat]] ^p-eat-context\n`;
const doneEntries = S.parseSection(donePlan, "Plan").entries;
let doneActual = S.startBlock(donePlan, doneEntries[0], new Date("2026-09-27T09:00:00Z"));
doneActual = S.startBlock(doneActual, doneEntries[1], new Date("2026-09-27T09:01:00Z"));
doneActual = S.doneTaskActuals(doneActual, "eat", new Date("2026-09-27T09:20:00Z"));
assert.equal(S.actualState(doneActual).mainLeaf, null);
assert.equal(S.actualState(doneActual).contexts.length, 0);
assert.match(doneActual, /0901-0920 \[\[Tasks#\^eat\|Eat\]\]/);
const multiTaskActual = `## Actual\n- 1300 p [[#^morning]] [[#^zaoming]] ^a-p1-1\n`;
assert.equal(S.actualState(S.doneTaskActuals(multiTaskActual, "zaoming", new Date("2026-09-27T13:30:00Z"))).mainLeaf, null);
const descendant = `## Actual\n- 0900 [[Tasks#^eat|Eat]] ^a-eat-1\n  - 0905 Other ^a-other-1\n`;
assert.throws(() => S.doneTaskActuals(descendant, "eat"), /active descendant/);
let pausedMain = S.startBlock(`## Plan\n- 0900 Focus ^p-focus\n`, S.parseSection(`## Plan\n- 0900 Focus ^p-focus\n`, "Plan").entries[0], new Date("2026-09-27T09:00:00Z"));
pausedMain = S.endBlock(pausedMain, S.actualState(pausedMain).mainLeaf, new Date("2026-09-27T09:10:00Z"), "pause");
assert.equal(S.completedPlanSlugs(pausedMain).has("focus"), true);
assert.doesNotMatch(pausedMain, /scheduled-block-paused/);
const switchPlan = `## Plan\n- 0900 Work ^p-work\n  - 0910 First ^p-first\n  - 0920 Second ^p-second\n- 1000 Break ^p-break\n- 0900-1100 Context ^p-context\n\n## Later\nUntouched\n`;
const switchEntries = S.parseSection(switchPlan, "Plan").entries;
let switched = S.startBlock(switchPlan, switchEntries[1], new Date("2026-09-27T09:10:00Z"));
switched = S.startBlock(switched, switchEntries[4], new Date("2026-09-27T09:11:00Z"));
assert.equal(S.switchDepth(switched, switchEntries[2]), 1);
switched = S.switchBlock(switched, switchEntries[2], new Date("2026-09-27T09:20:00Z"));
assert.deepEqual(S.actualState(switched).mainChain.map(e => e.id), ["a-work-1", "a-second-1"]);
assert.equal(S.actualIntervals(switched).find(x => x.entry.id === "a-first-1").end, 560);
switched = S.switchBlock(switched, switchEntries[0], new Date("2026-09-27T09:30:00Z"));
assert.deepEqual(S.actualState(switched).mainChain.map(e => e.id), ["a-work-2"]);
switched = S.switchBlock(switched, switchEntries[3], new Date("2026-09-27T10:00:00Z"));
assert.deepEqual(S.actualState(switched).mainChain.map(e => e.id), ["a-break-1"]);
switched = S.switchBlock(switched, switchEntries[1], new Date("2026-09-27T10:10:00Z"));
assert.deepEqual(S.actualState(switched).mainChain.map(e => e.id), ["a-work-3", "a-first-2"]);
assert.equal(S.actualState(switched).contexts.length, 1);
assert.equal(S.validateActualIntervals(switched).ok, true);
assert.doesNotMatch(switched, /scheduled-block-paused|scheduled-block-ended| — /);
assert.match(switched, /## Later\nUntouched/);
assert.throws(() => S.switchBlock(switched, switchEntries[4]), /main block/);

console.log("schedule-runner: all tests passed");

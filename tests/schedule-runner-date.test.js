const assert = require("assert");
const fs = require("fs");
const vm = require("vm");
const path = require("path");

// Exercise the adapter's date control and disk rehydration without Obsidian.
class Element {
  constructor(tag, options = {}) { this.tag = tag; this.children = []; Object.assign(this, options); }
  createEl(tag, options) { return this.appendChild(new Element(tag, options)); }
  appendChild(child) { child.parent = this; this.children.push(child); return child; }
  empty() { this.children = []; }
  addClass() {}
  setAttribute() {}
  remove() { this.parent.children = this.parent.children.filter(x => x !== this); }
}
const find = (node, predicate) => predicate(node) ? node : node.children.map(x => find(x, predicate)).find(Boolean);
const source = fs.readFileSync(path.join(__dirname, "../schedule-runner-ui.js"), "utf8");
const files = new Map();
let today = "2026-09-27";
const moment = Object.assign(function (value = today) {
  return {
    isValid: () => /^\d{4}-\d{2}-\d{2}$/.test(value),
    format: format => format === "YYYY/MM/DD" ? value.replaceAll("-", "/") : value,
  };
}, { utc() { throw new Error("Daily Note dates must use local moment time"); } });
const app = {
  internalPlugins: { plugins: { "daily-notes": { instance: { options: { folder: "Daily", format: "YYYY/MM/DD" } } } } },
  vault: {
    getAbstractFileByPath: path => files.has(path) ? { path } : null,
    read: async file => files.get(file.path),
    create: async (path, text) => { files.set(path, text); return { path }; },
    modify: async (file, text) => files.set(file.path, text),
    adapter: { read: async () => "" },
  },
};
async function load() {
  const root = new Element("root");
  await vm.runInNewContext(source, {
    __scheduleRunnerEntry: { dv: { current: () => ({ file: { folder: "Runner" } }), container: root, el: (_tag, text) => { throw new Error(text); } }, app, moment, Notice: class {}, config: { registry: {} } },
    ScheduleRunner: { validateRegistry: () => ({ ok: true }) },
    RoutineRunnerEmbed: { installStyles() {}, serializeSession: x => x, deserializeSession: x => x },
    document: { createElement: tag => new Element(tag) }, window: {}, setTimeout, clearTimeout,
  });
  return root;
}
(async () => {
  let root = await load();
  assert.equal(find(root, x => x.type === "date").value, today);
  const input = find(root, x => x.type === "date");
  input.value = "2026-09-26";
  await input.onchange();
  assert(find(root, x => x.text === "Local Daily Note · UTC block clocks · Daily/2026/09/26.md"));
  assert.equal(JSON.parse(files.get("Runner/schedule-runner-state.yaml")).selectedDate, "2026-09-26");
  today = "2026-09-28";
  root = await load();
  assert.equal(find(root, x => x.type === "date").value, "2026-09-26", "Reload after UTC midnight must preserve the selected date");
  assert(find(root, x => x.text === "Local Daily Note · UTC block clocks · Daily/2026/09/26.md"));
  console.log("schedule-runner date persistence: all tests passed");
})().catch(error => { console.error(error); process.exitCode = 1; });

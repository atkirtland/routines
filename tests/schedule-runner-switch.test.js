const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const S = require('../schedule-runner.js');
require('../routine-runner.js');
const E = require('../routine-runner-embed.js');
class Element {
  constructor(tag, options = {}) { this.tag = tag; this.children = []; this.style = { setProperty() {} }; Object.assign(this, options); }
  appendChild(child) { child.parent = this; this.children.push(child); return child; }
  createEl(tag, options) { return this.appendChild(new Element(tag, options)); }
  createDiv(options) { return this.createEl('div', options); }
  createSpan(options) { return this.createEl('span', options); }
  empty() { this.children = []; }
  addClass() {}
  setAttribute() {}
  addEventListener() {}
  showModal() {}
  close() {}
  remove() { this.parent.children = this.parent.children.filter(x => x !== this); }
}
const find = (node, predicate) => predicate(node) ? node : node.children.map(x => find(x, predicate)).find(Boolean);
const byLabel = (node, label) => find(node, x => x.textContent === label);
const notePath = '2026-09-29.md';
const initial = '## Plan\n- 0900 Work ^p-work\n- 1000 Break ^p-break\n- 1100 Later ^p-later\n\n## Actual\n- 0900 Work ^a-work-1\n- 1000 Break ^a-break-1\n';
async function setup(running = false, note = initial) {
  const files = new Map([[notePath, note], ['Runner/cache/schedule-runner-state.yaml', JSON.stringify({ 'schedule-runner-state-version': 2, sessions: { 'p-break': { running } } })]]);
  const root = new Element('root'), body = new Element('body'), notices = [], routineOptions = [];
  const app = { metadataCache: { getFileCache: () => ({}) }, internalPlugins: { plugins: {} }, vault: {
    getAbstractFileByPath: path => files.has(path) ? { path } : null,
    read: async file => files.get(file.path), modify: async (file, text) => files.set(file.path, text),
    create: async (path, text) => { files.set(path, text); return { path }; }, adapter: { read: async () => '' },
  } };
  await vm.runInNewContext(fs.readFileSync(require.resolve('../schedule-runner-ui.js'), 'utf8'), {
    __scheduleRunnerEntry: { dv: { current: () => ({ file: { folder: 'Runner' } }), container: root, el: (_, text) => { throw new Error(text); } }, app,
      moment: Object.assign((value = '2026-09-29') => ({ format: () => value, isValid: () => true }),
        { utc: (value = '2026-09-29') => ({ format: () => value, isValid: () => true }) }),
      Notice: class { constructor(message) { notices.push(message); } }, config: { registry: { version: 1, projects: {} } } },
    ScheduleRunner: S, RoutineRunnerEmbed: { ...E, model: E.model, createRunState: E.createRunState, renderPurgeCacheButton() {}, renderSession(_host, options) { routineOptions.push(options); return { dispose() {} }; }, installStyles() {}, serializeSession: x => x, deserializeSession: x => x, runningSession: x => !!x?.running },
    document: { body, createElement: tag => new Element(tag) }, window: {}, setTimeout, clearTimeout,
  });
  return { root, body, files, notices, routineOptions };
}
(async () => {
  const taskSource = '- [ ] Morning -- private comment ⏱️ 5:00 ➕ 2026-09-27 ^morning';
  const linked = await setup(false, `${taskSource}\n- [ ] Later ^later\n## Plan\n- 0900 p [[#^morning]] ^p-morning\n- 1100 q [[#^later]] ^p-later\n## Actual\n- 0900 p [[#^morning]] ^a-morning-1\n`);
  const sharedLabel = E.model(taskSource, 0).root.display;
  assert.equal(sharedLabel, 'Morning');
  assert(find(linked.root, x => x.tag === 'strong' && x.text === `p ${sharedLabel}`), 'Schedule card must use the shared task tree label');
  assert(linked.routineOptions.some(options => options.canStart === true), 'Tasks in a started time block can be started');
  assert(linked.routineOptions.some(options => options.canStart === false), 'Tasks in an unstarted time block cannot be started');
  const { root, body, files } = await setup();
  assert(!byLabel(root, 'Pause'));
  assert(!byLabel(root, 'End'));
  assert(byLabel(root, 'Restart'));
  assert(!byLabel(root, 'Select time block'), 'An active main block has only the Switch block entry point');
  assert.equal(byLabel(root, 'Switch block').disabled, false, 'Switch is available when the routine timer is paused');
  await byLabel(root, 'Switch block').onclick();
  assert.equal(files.get(notePath), initial, 'Opening chooser must not end current block');
  const selector = find(root, x => x.cls === 'sb-block-selector');
  assert.equal(selector.hidden, false);
  assert.equal(body.children.length, 0, 'Block selection must not open a popup');
  assert(find(selector, x => x.text === 'Ended blocks'));
  assert(byLabel(selector, 'Restart'));
  await byLabel(selector, 'Cancel').onclick();
  assert.equal(selector.hidden, true);
  assert.equal(files.get(notePath), initial);
  await byLabel(root, 'Switch block').onclick();
  await byLabel(selector, 'Restart').onclick();
  assert.equal(S.actualState(files.get(notePath)).mainLeaf.id, 'a-work-2');
  assert.doesNotMatch(files.get(notePath), /scheduled-block-paused| — /);
  await byLabel(root, 'Undo').onclick();
  assert.equal(files.get(notePath), initial);
  const guarded = await setup(true);
  assert.equal(byLabel(guarded.root, 'Switch block').disabled, true, 'Pause the routine timer before opening Switch block');
  assert(find(guarded.root, x => x.text === 'Pause the routine timer before switching or ending this scheduled block.'));
  assert(!byLabel(guarded.root, 'Select time block'), 'No alternate entry point while Switch block is disabled');
  assert(byLabel(guarded.root, 'Restart').disabled);
  assert(byLabel(guarded.root, 'Start new block').disabled);
  assert.equal(byLabel(guarded.root, 'Start new context').disabled, false);
  assert.equal(guarded.files.get(notePath), initial);
  const unplanned = await setup();
  await byLabel(unplanned.root, 'Switch block').onclick();
  find(unplanned.root, x => x.placeholder === 'Block description').value = 'Unexpected work';
  await byLabel(unplanned.root, 'Start new block').onclick();
  assert.equal(S.actualState(unplanned.files.get(notePath)).mainLeaf.body, 'Unexpected work');
  assert.doesNotMatch(unplanned.files.get(notePath), /scheduled-block-paused| — /);
  await byLabel(unplanned.root, 'Undo').onclick();
  assert.equal(unplanned.files.get(notePath), initial);
  await byLabel(unplanned.root, 'Switch block').onclick();
  find(unplanned.root, x => x.placeholder === 'Block description').value = 'Coworking';
  await byLabel(unplanned.root, 'Start new context').onclick();
  const withContext = S.actualState(unplanned.files.get(notePath));
  assert.equal(withContext.mainLeaf.id, 'a-break-1');
  assert.equal(withContext.contexts[0].body, 'Coworking');
  assert.equal(unplanned.body.children.length, 0);
  const idle = await setup(false, initial.split('## Actual')[0]);
  assert(byLabel(idle.root, 'Select time block'), 'Idle runner retains its selector entry point');
  assert(!byLabel(idle.root, 'Switch block'));
  console.log('schedule-runner switch UI: all tests passed');
})().catch(error => { console.error(error); process.exitCode = 1; });

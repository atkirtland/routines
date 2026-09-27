/* Routine Runner core. Works in Obsidian (globalThis.RoutineRunner) and Node. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.RoutineRunner = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const DEFAULT_ESTIMATE_MS = 5 * 60 * 1000;
  const TIME_GOAL_RE = /⏱️?\s*(\d+):(\d{2})(?::(\d{2}))?/;
  const COUNT_GOAL_RE = /🎯\s*(\d+)/;
  const TASK_LINE_RE = /^(\s*[-*+]\s\[)([^\]])(\]\s?)(.*)$/;
  const HEADING_RE = /^(#{1,6})\s+(.+?)\s*$/;
  const TASKS_METADATA_EMOJI_RE = /[🔺⏫🔼🔽⏬🔁➕🛫⏳📅✅❌🆔⛔]/;

  function parseEstimateMs(text, fallback = DEFAULT_ESTIMATE_MS) {
    const match = String(text).match(TIME_GOAL_RE);
    if (!match) return fallback;
    if (match[3] !== undefined)
      return ((Number(match[1]) * 60 + Number(match[2])) * 60 + Number(match[3])) * 1000;
    return (Number(match[1]) * 60 + Number(match[2])) * 1000;
  }

  function parseGoalCount(text) {
    const match = String(text).match(COUNT_GOAL_RE);
    return match ? Number(match[1]) : null;
  }

  function insertBeforeTasksMetadata(line, insertText) {
    const trimmed = String(line).replace(/\s+$/, "");
    const match = trimmed.match(TASKS_METADATA_EMOJI_RE);
    if (!match) return `${trimmed} ${insertText}`;
    const before = trimmed.slice(0, match.index).replace(/\s+$/, "");
    return `${before} ${insertText} ${trimmed.slice(match.index)}`;
  }

  function formatDuration(ms) {
    const negative = ms < 0;
    let seconds = Math.round(Math.abs(ms) / 1000);
    const hours = Math.floor(seconds / 3600);
    seconds -= hours * 3600;
    const minutes = Math.floor(seconds / 60);
    const rest = String(seconds % 60).padStart(2, "0");
    const value = hours ? `${hours}:${String(minutes).padStart(2, "0")}:${rest}` : `${minutes}:${rest}`;
    return (negative ? "-" : "") + value;
  }

  function parseRoutineText(content, defaultEstimateMs = DEFAULT_ESTIMATE_MS) {
    const lines = String(content).split("\n"), headings = [], tasks = [], stack = [];
    let nextId = 0;
    lines.forEach((line, index) => {
      const heading = line.match(HEADING_RE);
      if (heading) headings.push({ line: index, level: heading[1].length, text: heading[2] });
      const task = line.match(TASK_LINE_RE);
      if (!task) return;
      const description = task[4];
      const display = description.replace(TIME_GOAL_RE, "").replace(COUNT_GOAL_RE, "").replace(/\s{2,}/g, " ").trim();
      const prefix = task[1].slice(0, task[1].search(/[-*+]/));
      let indent = 0;
      for (const character of prefix) indent += character === "\t" ? 4 : 1;
      while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop();
      const parent = stack.at(-1) || null;
      const node = { id: `task-${nextId++}`, line: index, sourceLine: line, indent,
        parentId: parent?.id ?? null, children: [], checked: task[2] !== " ", selected: true,
        display, displayPath: [...(parent?.displayPath ?? []), display],
        estimateMs: parseEstimateMs(description, defaultEstimateMs), goalCount: parseGoalCount(description) };
      if (parent) parent.children.push(node);
      tasks.push(node); stack.push(node);
    });
    return { totalLines: lines.length, headings, tasks };
  }

  function sectionLineRange(headings, totalLines, index) {
    const heading = headings[index];
    let end = totalLines;
    for (let i = index + 1; i < headings.length; i++) if (headings[i].level <= heading.level) { end = headings[i].line; break; }
    return { start: heading.line + 1, end };
  }

  function fuzzyScore(query, text) {
    query = String(query).toLowerCase(); text = String(text).toLowerCase();
    let qi = 0, score = 0, streak = 0;
    for (let ti = 0; ti < text.length && qi < query.length; ti++) {
      if (text[ti] === query[qi]) { qi++; streak++; score += 1 + streak * 0.5; }
      else streak = 0;
    }
    return qi === query.length ? score : -1;
  }

  function flatten(nodes) {
    const result = [];
    const visit = node => { result.push(node); node.children.forEach(visit); };
    nodes.forEach(visit); return result;
  }
  function nodeMap(nodes) { return new Map(flatten(nodes).map(node => [node.id, node])); }
  function effective(node, map) {
    for (let current = node; current; current = current.parentId ? map.get(current.parentId) : null)
      if (!current.selected) return false;
    return true;
  }
  function enabledLeaves(nodes) {
    const map = nodeMap(nodes);
    return flatten(nodes).filter(node => node.children.length === 0 && effective(node, map));
  }
  function selectedRoutineTree(nodes) {
    const enabled = new Set(enabledLeaves(nodes).map(task => task.id));
    const keep = node => {
      const children = node.children.map(keep).filter(Boolean);
      return enabled.has(node.id) || children.length ? { ...node, children } : null;
    };
    return nodes.map(keep).filter(Boolean);
  }
  function elapsedForSession(session, now = Date.now()) {
    if (!session) return 0;
    return session.elapsedBeforeStartMs + (session.startedAt == null ? 0 : Math.max(0, now - session.startedAt));
  }

  return { DEFAULT_ESTIMATE_MS, TIME_GOAL_RE, COUNT_GOAL_RE, TASK_LINE_RE, HEADING_RE,
    parseEstimateMs, parseGoalCount, insertBeforeTasksMetadata, formatDuration, parseRoutineText,
    sectionLineRange, fuzzyScore, flatten, nodeMap, effective, enabledLeaves, selectedRoutineTree, elapsedForSession };
});

/* Routine Runner core. Works in Obsidian (globalThis.RoutineRunner) and Node. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.RoutineRunner = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const DEFAULT_ESTIMATE_MS = 0;
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

  function taskCommentParts(description) {
    const marker = description.indexOf(" -- ");
    const start = marker < 0 ? 0 : marker + 4;
    const tail = description.slice(start);
    const metadata = tail.search(/\s+(?=#[\p{L}\p{N}_/\-]+|\^[\p{L}\p{N}_-]+\s*$|[🔺⏫🔼🔽⏬🔁➕🛫⏳📅✅❌🆔⛔⏱🎯🏁🥅]|\[\p{Extended_Pictographic})/u);
    const boundary = metadata < 0 ? description.length : start + metadata;
    return { name: description.slice(0, marker < 0 ? boundary : marker).trimEnd(),
      comment: marker < 0 ? "" : description.slice(start, boundary).trim(), suffix: description.slice(boundary) };
  }

  // Metadata fields hidden from every task label. Each field consumes only its
  // own value so ordinary words next to an emoji are not swallowed.
  const METADATA_FIELD_RE = new RegExp([
    "[🔺⏫🔼🔽⏬]\\uFE0F?",
    "[➕🛫⏳📅✅❌]\\uFE0F?\\s*\\d{4}-\\d{2}-\\d{2}",
    "[⏱🏁]\\uFE0F?\\s*-?\\d+:\\d{2}(?::\\d{2})?",
    "[🎯🥅]\\uFE0F?\\s*\\d+",
    "🆔\\uFE0F?\\s*[\\p{L}\\p{N}_-]+",
    "⛔\\uFE0F?\\s*[\\p{L}\\p{N}_-]+(?:\\s*,\\s*[\\p{L}\\p{N}_-]+)*",
    "🔁\\uFE0F?[^🔺⏫🔼🔽⏬➕🛫⏳📅✅❌🆔⛔⏱🎯🏁🥅#^\\[]*",
  ].map(pattern => `\\s*(?:${pattern})`).join("|"), "gu");
  // Bracketed metadata groups such as `[🏁 5:00, 🥅 3]` (not markdown links).
  const METADATA_GROUP_RE = /\s*\[\s*\p{Extended_Pictographic}[^\]]*\](?!\()/gu;

  // The single human-facing label for a task, shared by Routine Runner,
  // embedded runs, and Schedule Runner. Accepts a task line, a list line, or a
  // bare description; it is idempotent, so saved labels can be re-normalized.
  function taskDisplay(text) {
    const value = String(text ?? "");
    const task = value.match(TASK_LINE_RE);
    const description = task ? task[4] : value.replace(/^\s*[-*+]\s+/, "");
    const parts = taskCommentParts(description);
    return (parts.name + parts.suffix)
      .replace(METADATA_GROUP_RE, "").replace(METADATA_FIELD_RE, "")
      .replace(/\s+\^[\p{L}\p{N}_-]+\s*$/u, "").replace(/\s{2,}/g, " ").trim();
  }

  // Task keys are display paths joined by NUL; re-normalize keys saved before
  // the current display rules so running sessions keep their identity.
  function normalizeTaskKey(key) {
    return String(key).split("\u0000").map(taskDisplay).join("\u0000");
  }

  function withTaskComment(line, comment) {
    const match = line.match(TASK_LINE_RE);
    if (!match) throw new Error("Referenced line is no longer a task");
    const parts = taskCommentParts(match[4]);
    const value = String(comment).replace(/[\r\n]+/g, " ").trim();
    return `${match[1]}${match[2]}${match[3]}${parts.name}${value ? ` -- ${value}` : ""}${parts.suffix}`;
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
      // Metadata and block IDs are not part of the human-facing label; the
      // full text stays in sourceLine for recovery/persistence.
      const commentParts = taskCommentParts(description);
      const display = taskDisplay(description);
      const prefix = task[1].slice(0, task[1].search(/[-*+]/));
      let indent = 0;
      for (const character of prefix) indent += character === "\t" ? 4 : 1;
      while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop();
      const parent = stack.at(-1) || null;
      const node = { id: `task-${nextId++}`, line: index, sourceLine: line, indent,
        parentId: parent?.id ?? null, children: [], checked: task[2] !== " ", selected: true,
        display, comment: commentParts.comment, displayPath: [...(parent?.displayPath ?? []), display],
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
  function taskPath(node, map) {
    const path = [];
    for (let current = node; current; current = current.parentId ? map.get(current.parentId) : null) path.unshift(current);
    return path;
  }
  function taskAtLine(parsed, line) {
    return parsed.tasks.find(task => task.line === line) || null;
  }
  function cloneTaskTree(node) {
    if (!node) return null;
    return { ...node, children: node.children.map(cloneTaskTree) };
  }
  function referencedTaskTree(content, line, defaultEstimateMs = DEFAULT_ESTIMATE_MS) {
    const parsed = parseRoutineText(content, defaultEstimateMs);
    const source = taskAtLine(parsed, line);
    return { parsed, root: cloneTaskTree(source) };
  }
  function availableLeaves(root) {
    return root ? flatten([root]).filter(node => !node.checked && node.children.every(child => child.checked)) : [];
  }
  // An unfinished parent becomes actionable only after every direct child has
  // acquired a checkbox status. Since `checked` means "symbol is not a space",
  // this includes Tasks statuses such as [x], [-], and [/].
  function readyParents(nodes, isMarked = node => node.checked, isEligible = () => true) {
    return flatten(nodes).filter(node => node.children.length && !isMarked(node)
      && isEligible(node) && node.children.every(isMarked));
  }
  function elapsedForSession(session, now = Date.now()) {
    if (!session) return 0;
    const elapsedBeforeStartMs = Number(session.elapsedBeforeStartMs) || 0;
    if (session.startedAt == null) return Math.max(0, elapsedBeforeStartMs);
    const startedAt = Number(session.startedAt);
    if (!Number.isFinite(startedAt)) return Math.max(0, elapsedBeforeStartMs);
    return Math.max(0, elapsedBeforeStartMs) + Math.max(0, Number(now) - startedAt);
  }

  return { DEFAULT_ESTIMATE_MS, TIME_GOAL_RE, COUNT_GOAL_RE, TASK_LINE_RE, HEADING_RE,
    parseEstimateMs, parseGoalCount, taskCommentParts, taskDisplay, normalizeTaskKey, withTaskComment, insertBeforeTasksMetadata, formatDuration, parseRoutineText,
    sectionLineRange, fuzzyScore, flatten, nodeMap, effective, enabledLeaves, selectedRoutineTree,
    taskPath, taskAtLine, cloneTaskTree, referencedTaskTree, availableLeaves, readyParents, elapsedForSession };
});

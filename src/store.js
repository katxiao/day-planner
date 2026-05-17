import { useState, useEffect } from 'react';

const STORAGE_KEY = 'day-planner-data';

const defaultState = {
  tasks: [],
  inbox: [],
  blocks: [],
  dayQueues: {},   // { 'YYYY-MM-DD': ['taskId', ...] }
  focuses: [],     // quarterly focus themes
  focusIdeas: [],  // unscheduled future focus ideas
  habitLogs: {},   // { 'YYYY-MM-DD': ['habitId', ...] }
};

export const FOCUS_COLORS = ['#5a7a52', '#b85c40', '#6b7fa8', '#c4923a'];

export function localDateStr(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const state = raw ? { ...defaultState, ...JSON.parse(raw) } : defaultState;

    // Migrate: old flat dayQueue → dayQueues[today]
    if (state.dayQueue?.length && !Object.keys(state.dayQueues || {}).length) {
      const today = localDateStr();
      state.dayQueues = { [today]: state.dayQueue };
    }
    delete state.dayQueue;
    if (!state.dayQueues) state.dayQueues = {};

    // Migrate: non-recurring blocks without a date get today's date
    const today = localDateStr();
    state.blocks = (state.blocks || []).map(b =>
      b.recurrence?.length === 0 && !b.date ? { ...b, date: today } : b
    );

    return state;
  } catch {
    return defaultState;
  }
}

function save(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function useStore() {
  const [state, setState] = useState(load);

  useEffect(() => { save(state); }, [state]);

  function updateState(updater) {
    setState(prev => updater(prev));
  }

  // ---- Tasks ----
  function addTask({ title, quadrant, focusId }) {
    const task = { id: crypto.randomUUID(), title, quadrant, done: false, notes: '', createdAt: Date.now(), ...(focusId ? { focusId } : {}) };
    updateState(s => ({ ...s, tasks: [...s.tasks, task] }));
    return task.id;
  }

  function updateTask(id, patch) {
    updateState(s => ({ ...s, tasks: s.tasks.map(t => t.id === id ? { ...t, ...patch } : t) }));
  }

  function deleteTask(id) {
    updateState(s => {
      // Remove from every day's queue
      const dayQueues = {};
      for (const [date, q] of Object.entries(s.dayQueues)) {
        dayQueues[date] = q.filter(qid => qid !== id);
      }
      return { ...s, tasks: s.tasks.filter(t => t.id !== id), dayQueues };
    });
  }

  function moveTask(id, quadrant) { updateTask(id, { quadrant }); }

  function reorderTasks(quadrant, orderedIds) {
    updateState(s => {
      const byId = Object.fromEntries(s.tasks.map(t => [t.id, t]));
      const others = s.tasks.filter(t => t.quadrant !== quadrant);
      return { ...s, tasks: [...others, ...orderedIds.map(id => byId[id]).filter(Boolean)] };
    });
  }

  // ---- Inbox ----
  function addToInbox(title, focusId) {
    const item = { id: crypto.randomUUID(), title, createdAt: Date.now(), ...(focusId ? { focusId } : {}) };
    updateState(s => ({ ...s, inbox: [...s.inbox, item] }));
  }

  function deleteFromInbox(id) {
    updateState(s => ({ ...s, inbox: s.inbox.filter(i => i.id !== id) }));
  }

  function moveFromInboxToQuadrant(id, quadrant) {
    updateState(s => {
      const item = s.inbox.find(i => i.id === id);
      if (!item) return s;
      const task = { id: crypto.randomUUID(), title: item.title, quadrant, done: false, notes: '', createdAt: Date.now(), ...(item.focusId ? { focusId: item.focusId } : {}) };
      return { ...s, inbox: s.inbox.filter(i => i.id !== id), tasks: [...s.tasks, task] };
    });
  }

  function reorderInbox(orderedIds) {
    updateState(s => {
      const byId = Object.fromEntries(s.inbox.map(i => [i.id, i]));
      return { ...s, inbox: orderedIds.map(id => byId[id]).filter(Boolean) };
    });
  }

  // ---- Day queues (per-date) ----
  function getQueueForDate(dateStr) {
    return state.dayQueues[dateStr] || [];
  }

  function addToDateQueue(taskId, dateStr) {
    updateState(s => {
      const q = s.dayQueues[dateStr] || [];
      if (q.includes(taskId)) return s;
      return { ...s, dayQueues: { ...s.dayQueues, [dateStr]: [...q, taskId] } };
    });
  }

  function removeFromDateQueue(taskId, dateStr) {
    updateState(s => {
      const q = (s.dayQueues[dateStr] || []).filter(id => id !== taskId);
      return { ...s, dayQueues: { ...s.dayQueues, [dateStr]: q } };
    });
  }

  function reorderDateQueue(dateStr, orderedIds) {
    updateState(s => ({ ...s, dayQueues: { ...s.dayQueues, [dateStr]: orderedIds } }));
  }

  // Shortcut: add to today (used by matrix "→ Today" button)
  function addToQueue(taskId) { addToDateQueue(taskId, localDateStr()); }

  // ---- Time blocks ----
  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  function addBlock({ label, startTime, endTime, color, recurrence, taskId, date }) {
    const block = {
      id: crypto.randomUUID(),
      label, startTime, endTime,
      color: color || '#5a7a52',
      recurrence: recurrence || [],
      createdAt: Date.now(),
      ...(taskId ? { taskId } : {}),
      ...(date ? { date } : {}),
    };
    updateState(s => ({ ...s, blocks: [...s.blocks, block] }));
  }

  function updateBlock(id, patch) {
    updateState(s => ({ ...s, blocks: s.blocks.map(b => b.id === id ? { ...b, ...patch } : b) }));
  }

  function deleteBlock(id) {
    updateState(s => ({ ...s, blocks: s.blocks.filter(b => b.id !== id) }));
  }

  function blocksForDate(dateStr) {
    const d = new Date(dateStr + 'T12:00:00');
    const dayName = DAYS[d.getDay()];
    return state.blocks.filter(b => {
      if (b.recurrence?.length > 0) return b.recurrence.includes(dayName);
      return b.date === dateStr;
    });
  }

  // ---- Quarterly focuses ----
  function addFocus(quarter) {
    const existingCount = (state.focuses || []).filter(f => f.quarter === quarter).length;
    const focus = {
      id: crypto.randomUUID(),
      quarter,
      color: FOCUS_COLORS[existingCount % FOCUS_COLORS.length],
      title: '',
      hypothesisAction: '',
      hypothesisOutcome: '',
      measurableOutcome: '',
      habits: [],
      setupTasks: [],
      createdAt: Date.now(),
    };
    updateState(s => ({ ...s, focuses: [...(s.focuses || []), focus] }));
  }

  function updateFocus(id, patch) {
    updateState(s => ({ ...s, focuses: (s.focuses || []).map(f => f.id === id ? { ...f, ...patch } : f) }));
  }

  function deleteFocus(id) {
    updateState(s => ({ ...s, focuses: (s.focuses || []).filter(f => f.id !== id) }));
  }

  function addHabitToFocus(focusId, title, days = []) {
    const habit = { id: crypto.randomUUID(), title, days };
    updateState(s => ({ ...s, focuses: (s.focuses || []).map(f => f.id === focusId ? { ...f, habits: [...f.habits, habit] } : f) }));
  }

  function updateHabitDays(focusId, habitId, days) {
    updateState(s => ({
      ...s,
      focuses: (s.focuses || []).map(f => f.id === focusId
        ? { ...f, habits: f.habits.map(h => h.id === habitId ? { ...h, days } : h) }
        : f),
    }));
  }

  function removeHabitFromFocus(focusId, habitId) {
    updateState(s => ({ ...s, focuses: (s.focuses || []).map(f => f.id === focusId ? { ...f, habits: f.habits.filter(h => h.id !== habitId) } : f) }));
  }

  function addSetupTaskToFocus(focusId, title) {
    const task = { id: crypto.randomUUID(), title };
    updateState(s => ({ ...s, focuses: (s.focuses || []).map(f => f.id === focusId ? { ...f, setupTasks: [...f.setupTasks, task] } : f) }));
  }

  function removeSetupTaskFromFocus(focusId, taskId) {
    updateState(s => ({ ...s, focuses: (s.focuses || []).map(f => f.id === focusId ? { ...f, setupTasks: f.setupTasks.filter(t => t.id !== taskId) } : f) }));
  }

  // ---- Focus ideas (unscheduled backlog) ----
  function addFocusIdea() {
    const idea = { id: crypto.randomUUID(), title: '', hypothesisAction: '', hypothesisOutcome: '', createdAt: Date.now() };
    updateState(s => ({ ...s, focusIdeas: [...(s.focusIdeas || []), idea] }));
  }

  function updateFocusIdea(id, patch) {
    updateState(s => ({ ...s, focusIdeas: (s.focusIdeas || []).map(i => i.id === id ? { ...i, ...patch } : i) }));
  }

  function deleteFocusIdea(id) {
    updateState(s => ({ ...s, focusIdeas: (s.focusIdeas || []).filter(i => i.id !== id) }));
  }

  function promoteFocusIdea(ideaId, quarter) {
    const idea = (state.focusIdeas || []).find(i => i.id === ideaId);
    if (!idea) return;
    const existingCount = (state.focuses || []).filter(f => f.quarter === quarter).length;
    if (existingCount >= 4) return;
    const focus = {
      id: crypto.randomUUID(),
      quarter,
      color: FOCUS_COLORS[existingCount % FOCUS_COLORS.length],
      title: idea.title,
      hypothesisAction: idea.hypothesisAction,
      hypothesisOutcome: idea.hypothesisOutcome,
      measurableOutcome: '',
      habits: [],
      setupTasks: [],
      createdAt: Date.now(),
    };
    updateState(s => ({ ...s, focuses: [...(s.focuses || []), focus] }));
  }

  // ---- Habit logs ----
  function toggleHabitLog(habitId, dateStr) {
    updateState(s => {
      const log = s.habitLogs?.[dateStr] || [];
      const next = log.includes(habitId) ? log.filter(id => id !== habitId) : [...log, habitId];
      return { ...s, habitLogs: { ...(s.habitLogs || {}), [dateStr]: next } };
    });
  }

  return {
    tasks: state.tasks,
    inbox: state.inbox,
    blocks: state.blocks,
    dayQueues: state.dayQueues,
    focuses: state.focuses || [],
    focusIdeas: state.focusIdeas || [],
    habitLogs: state.habitLogs || {},
    addTask, updateTask, deleteTask, moveTask, reorderTasks,
    addToInbox, deleteFromInbox, moveFromInboxToQuadrant, reorderInbox,
    getQueueForDate, addToDateQueue, removeFromDateQueue, reorderDateQueue, addToQueue,
    addBlock, updateBlock, deleteBlock, blocksForDate,
    addFocus, updateFocus, deleteFocus,
    addFocusIdea, updateFocusIdea, deleteFocusIdea, promoteFocusIdea,
    addHabitToFocus, removeHabitFromFocus, updateHabitDays, addSetupTaskToFocus, removeSetupTaskFromFocus,
    toggleHabitLog,
    DAYS,
  };
}

import { useState, useEffect } from 'react';

const STORAGE_KEY = 'day-planner-data';

const defaultState = {
  tasks: [],
  inbox: [],
  blocks: [],
  dayOrders: {},    // { 'YYYY-MM-DD': ['taskId', ...] } — ordering only
  focuses: [],      // quarterly focus themes
  focusIdeas: [],   // unscheduled future focus ideas
  habitLogs: {},    // { 'YYYY-MM-DD': ['habitId', ...] }
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
      state.dayQueues = { [localDateStr()]: state.dayQueue };
    }
    delete state.dayQueue;

    // Migrate: dayQueues → task.scheduledDate + dayOrders
    if (state.dayQueues) {
      const taskDates = {};
      for (const [date, ids] of Object.entries(state.dayQueues)) {
        for (const id of (ids || [])) {
          if (!taskDates[id] || date > taskDates[id]) taskDates[id] = date;
        }
      }
      state.tasks = (state.tasks || []).map(t =>
        taskDates[t.id] ? { ...t, scheduledDate: taskDates[t.id] } : t
      );
      if (!state.dayOrders) {
        const orders = {};
        for (const [date, ids] of Object.entries(state.dayQueues)) {
          const valid = (ids || []).filter(id => state.tasks.find(t => t.id === id)?.scheduledDate === date);
          if (valid.length) orders[date] = valid;
        }
        state.dayOrders = orders;
      }
      delete state.dayQueues;
    }
    if (!state.dayOrders) state.dayOrders = {};

    // Migrate: non-recurring blocks without a date get today's date
    const today = localDateStr();
    state.blocks = (state.blocks || []).map(b =>
      b.recurrence?.length === 0 && !b.date ? { ...b, date: today } : b
    );

    // Rollover: move incomplete tasks with a past scheduledDate to today
    const todayStr = localDateStr();
    const rollIds = new Set(
      (state.tasks || [])
        .filter(t => t.scheduledDate && t.scheduledDate < todayStr && !t.done)
        .map(t => t.id)
    );
    if (rollIds.size > 0) {
      state.tasks = state.tasks.map(t =>
        rollIds.has(t.id) ? { ...t, scheduledDate: todayStr } : t
      );
      const orders = { ...state.dayOrders };
      for (const [date, ids] of Object.entries(orders)) {
        if (date < todayStr) orders[date] = ids.filter(id => !rollIds.has(id));
      }
      const todayOrder = orders[todayStr] || [];
      const todaySet = new Set(todayOrder);
      orders[todayStr] = [...todayOrder, ...[...rollIds].filter(id => !todaySet.has(id))];
      state.dayOrders = orders;
    }

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
    updateState(s => ({
      ...s,
      tasks: s.tasks.map(t => {
        if (t.id !== id) return t;
        const updated = { ...t, ...patch };
        if (patch.done === true && !t.done) updated.completedAt = Date.now();
        if (patch.done === false) delete updated.completedAt;
        return updated;
      }),
    }));
  }

  function deleteTask(id) {
    updateState(s => {
      const task = s.tasks.find(t => t.id === id);
      const orders = { ...s.dayOrders };
      if (task?.scheduledDate && orders[task.scheduledDate]) {
        orders[task.scheduledDate] = orders[task.scheduledDate].filter(oid => oid !== id);
      }
      return { ...s, tasks: s.tasks.filter(t => t.id !== id), dayOrders: orders };
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
      const task = { id: item.id, title: item.title, quadrant, done: false, notes: '', createdAt: Date.now(), ...(item.focusId ? { focusId: item.focusId } : {}) };
      return { ...s, inbox: s.inbox.filter(i => i.id !== id), tasks: [...s.tasks, task] };
    });
  }

  function reorderInbox(orderedIds) {
    updateState(s => {
      const byId = Object.fromEntries(s.inbox.map(i => [i.id, i]));
      return { ...s, inbox: orderedIds.map(id => byId[id]).filter(Boolean) };
    });
  }

  // ---- Day scheduling ----
  function getTasksForDate(dateStr) {
    const scheduled = state.tasks.filter(t => t.scheduledDate === dateStr);
    const order = state.dayOrders[dateStr] || [];
    const posMap = Object.fromEntries(order.map((id, i) => [id, i]));
    return scheduled.sort((a, b) => (posMap[a.id] ?? Infinity) - (posMap[b.id] ?? Infinity));
  }

  function scheduleTask(taskId, dateStr) {
    updateState(s => {
      const task = s.tasks.find(t => t.id === taskId);
      if (!task) return s;
      const oldDate = task.scheduledDate;
      const tasks = s.tasks.map(t => t.id === taskId ? { ...t, scheduledDate: dateStr } : t);
      const orders = { ...s.dayOrders };
      if (oldDate && oldDate !== dateStr && orders[oldDate]) {
        orders[oldDate] = orders[oldDate].filter(id => id !== taskId);
      }
      if (!(orders[dateStr] || []).includes(taskId)) {
        orders[dateStr] = [...(orders[dateStr] || []), taskId];
      }
      return { ...s, tasks, dayOrders: orders };
    });
  }

  function unscheduleTask(taskId) {
    updateState(s => {
      const task = s.tasks.find(t => t.id === taskId);
      if (!task) return s;
      const tasks = s.tasks.map(t => t.id === taskId ? { ...t, scheduledDate: undefined } : t);
      const orders = { ...s.dayOrders };
      if (task.scheduledDate && orders[task.scheduledDate]) {
        orders[task.scheduledDate] = orders[task.scheduledDate].filter(id => id !== taskId);
      }
      return { ...s, tasks, dayOrders: orders };
    });
  }

  function reorderDayOrder(dateStr, orderedIds) {
    updateState(s => ({ ...s, dayOrders: { ...s.dayOrders, [dateStr]: orderedIds } }));
  }

  // Shortcut: schedule for today (used by matrix "→ Today" button)
  function addToQueue(taskId) { scheduleTask(taskId, localDateStr()); }

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
    const id = crypto.randomUUID();
    const setupTask = { id, title };
    const inboxItem = { id, title, createdAt: Date.now(), focusId };
    updateState(s => ({
      ...s,
      focuses: (s.focuses || []).map(f => f.id === focusId ? { ...f, setupTasks: [...f.setupTasks, setupTask] } : f),
      inbox: [...s.inbox, inboxItem],
    }));
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
    focuses: state.focuses || [],
    focusIdeas: state.focusIdeas || [],
    habitLogs: state.habitLogs || {},
    addTask, updateTask, deleteTask, moveTask, reorderTasks,
    addToInbox, deleteFromInbox, moveFromInboxToQuadrant, reorderInbox,
    getTasksForDate, scheduleTask, unscheduleTask, reorderDayOrder, addToQueue,
    addBlock, updateBlock, deleteBlock, blocksForDate,
    addFocus, updateFocus, deleteFocus,
    addFocusIdea, updateFocusIdea, deleteFocusIdea, promoteFocusIdea,
    addHabitToFocus, removeHabitFromFocus, updateHabitDays, addSetupTaskToFocus, removeSetupTaskFromFocus,
    toggleHabitLog,
    DAYS,
  };
}

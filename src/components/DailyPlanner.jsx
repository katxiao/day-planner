import { useState, useRef, useEffect } from 'react';
import {
  DndContext, PointerSensor, useSensor, useSensors,
  pointerWithin, rectIntersection, useDroppable,
} from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, arrayMove, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { BlockForm } from './BlockForm';
import { HabitTracker } from './HabitTracker';

// ---- Grid constants ----
const START_HOUR = 6;
const END_HOUR = 23;
const HOUR_HEIGHT = 64;
const HOURS = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i);
const TOTAL_HEIGHT = (END_HOUR - START_HOUR) * HOUR_HEIGHT;
const TASK_BLOCK_DURATION = 30; // default minutes for dropped tasks

// ---- Time utilities ----
function fmt12(h, m = 0) {
  const ampm = h >= 12 ? 'pm' : 'am';
  const hour = h % 12 || 12;
  return m === 0 ? `${hour}${ampm}` : `${hour}:${m.toString().padStart(2, '0')}${ampm}`;
}
function fmtTimeStr(timeStr) {
  const [h, m] = timeStr.split(':').map(Number);
  return fmt12(h, m);
}
function timeToMinutes(timeStr) {
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
}
function minutesToTime(total) {
  const clamped = Math.max(START_HOUR * 60, Math.min(END_HOUR * 60, total));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}
function minutesToPx(totalMin) {
  return ((totalMin - START_HOUR * 60) / 60) * HOUR_HEIGHT;
}
function pxToMinutes(px) {
  const raw = (Math.max(0, Math.min(px, TOTAL_HEIGHT)) / HOUR_HEIGHT) * 60 + START_HOUR * 60;
  return Math.round(raw / 15) * 15;
}

// ---- Overlap layout ----
// Groups blocks by connected time overlap, then assigns columns within each group.
// Sorting newest-first only happens *inside* overlap groups, so non-overlapping
// blocks are never pushed off col 0 by an unrelated newer block.
function computeLayout(blocks, draggingBlock, resizingBlock, previewItem = null) {
  const items = blocks.map(block => {
    const isDragging = draggingBlock?.block.id === block.id;
    const isResizing = resizingBlock?.block.id === block.id;
    const deltaMin = isDragging ? draggingBlock.deltaMin : 0;
    const startMin = timeToMinutes(block.startTime) + deltaMin;
    const endMin = isResizing
      ? resizingBlock.newEndMin
      : timeToMinutes(block.endTime) + deltaMin;
    return { block, startMin, endMin, isDragging, isResizing, isPreview: false };
  });

  if (previewItem) {
    items.push({ block: null, startMin: previewItem.startMin, endMin: previewItem.endMin, isDragging: false, isResizing: false, isPreview: true });
  }

  // Build connected overlap groups (BFS)
  const used = new Array(items.length).fill(false);
  const groups = [];
  for (let i = 0; i < items.length; i++) {
    if (used[i]) continue;
    const group = [i];
    used[i] = true;
    for (let j = 0; j < group.length; j++) {
      const a = items[group[j]];
      for (let k = 0; k < items.length; k++) {
        if (used[k]) continue;
        const b = items[k];
        if (a.startMin < b.endMin && a.endMin > b.startMin) {
          group.push(k);
          used[k] = true;
        }
      }
    }
    groups.push(group.map(idx => items[idx]));
  }

  const result = [];

  for (const group of groups) {
    // Non-overlapping singleton — always full width, no sorting needed
    if (group.length === 1) {
      result.push({ ...group[0], col: 0, numCols: 1 });
      continue;
    }

    // Within an actual overlap group: preview first, then newest block first → col 0
    const sorted = [...group].sort((a, b) => {
      if (a.isPreview !== b.isPreview) return a.isPreview ? -1 : 1;
      const aCreated = a.block?.createdAt ?? 0;
      const bCreated = b.block?.createdAt ?? 0;
      if (bCreated !== aCreated) return bCreated - aCreated;
      return a.startMin - b.startMin;
    });

    const colEnds = [];
    const withCols = sorted.map(item => {
      let col = colEnds.findIndex(end => end <= item.startMin);
      if (col === -1) { col = colEnds.length; colEnds.push(item.endMin); }
      else colEnds[col] = item.endMin;
      return { ...item, col };
    });

    withCols.forEach(item => {
      const numCols = withCols
        .filter(o => o.startMin < item.endMin && o.endMin > item.startMin)
        .reduce((max, o) => Math.max(max, o.col), 0) + 1;
      result.push({ ...item, numCols });
    });
  }

  return result;
}

// ---- Calendar grid ----
function DayGrid({ blocks, onAdd, onEdit, onBlockMove, activeQueueTask, onGridColRef }) {
  const gridRef = useRef(null);
  const scrollRef = useRef(null);
  const drawDragInfo = useRef(null);
  const pendingInputRef = useRef(null);
  const [drawPreview, setDrawPreview] = useState(null);
  const [queuePreviewMin, setQueuePreviewMin] = useState(null);
  const [pending, setPending] = useState(null);
  const [draggingBlock, setDraggingBlock] = useState(null); // { block, deltaMin }
  const [resizingBlock, setResizingBlock] = useState(null); // { block, newEndMin }
  const [now, setNow] = useState(() => new Date());

  // Make the grid column a droppable target for queue tasks
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: 'day-grid-drop' });

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  // Scroll to current time on mount
  useEffect(() => {
    if (!scrollRef.current) return;
    const y = minutesToPx(now.getHours() * 60 + now.getMinutes());
    scrollRef.current.scrollTop = Math.max(0, y - 160);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Track pointer position while a queue task is being dragged over the grid
  useEffect(() => {
    if (!activeQueueTask) { setQueuePreviewMin(null); return; }
    function onMove(e) {
      if (!gridRef.current) return;
      const rect = gridRef.current.getBoundingClientRect();
      const y = e.clientY - rect.top;
      setQueuePreviewMin(y >= 0 && y <= TOTAL_HEIGHT ? pxToMinutes(y) : null);
    }
    window.addEventListener('pointermove', onMove);
    return () => window.removeEventListener('pointermove', onMove);
  }, [activeQueueTask]);

  const nowMin = now.getHours() * 60 + now.getMinutes();
  const nowY = minutesToPx(nowMin);
  const showNowLine = nowMin >= START_HOUR * 60 && nowMin < END_HOUR * 60;

  function getGridY(clientY) {
    return clientY - gridRef.current.getBoundingClientRect().top;
  }

  function handleResizeMouseDown(e, block) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();

    const origStartMin = timeToMinutes(block.startTime);
    let latestEndMin = timeToMinutes(block.endTime);

    function onMove(ev) {
      const y = ev.clientY - gridRef.current.getBoundingClientRect().top;
      const snapped = pxToMinutes(y);
      latestEndMin = Math.max(origStartMin + 15, Math.min(snapped, END_HOUR * 60));
      setResizingBlock({ block, newEndMin: latestEndMin });
    }

    function onUp() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      setResizingBlock(null);
      onBlockMove(block.id, block.startTime, minutesToTime(latestEndMin));
    }

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  function handleBlockMouseDown(e, block) {
    if (e.button !== 0) return;
    if (e.target.closest('.tblock-resize-handle')) return; // handled by resize
    e.preventDefault();
    e.stopPropagation();

    const startY = e.clientY;
    const origStartMin = timeToMinutes(block.startTime);
    const origEndMin = timeToMinutes(block.endTime);
    const duration = origEndMin - origStartMin;
    let hasMoved = false;
    let latestDeltaMin = 0;

    function onMove(ev) {
      const deltaY = ev.clientY - startY;
      if (Math.abs(deltaY) > 3) hasMoved = true;
      const rawDelta = (deltaY / HOUR_HEIGHT) * 60;
      const snapped = Math.round(rawDelta / 15) * 15;
      const clampedStart = Math.max(START_HOUR * 60, Math.min(origStartMin + snapped, END_HOUR * 60 - duration));
      latestDeltaMin = clampedStart - origStartMin;
      setDraggingBlock({ block, deltaMin: latestDeltaMin });
    }

    function onUp() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      if (!hasMoved) {
        setDraggingBlock(null);
        onEdit(block);
        return;
      }
      const newStartMin = origStartMin + latestDeltaMin;
      setDraggingBlock(null);
      onBlockMove(block.id, minutesToTime(newStartMin), minutesToTime(newStartMin + duration));
    }

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  function startDraw(e) {
    if (e.button !== 0) return;
    if (activeQueueTask) return; // don't start draw while dragging a task
    if (e.target.closest('.tblock-placed')) return;
    e.preventDefault();

    const startMin = pxToMinutes(getGridY(e.clientY));
    drawDragInfo.current = { startMin, endMin: startMin + 30 };
    setDrawPreview({ startMin, endMin: startMin + 30 });

    function onMove(ev) {
      if (!drawDragInfo.current) return;
      const curMin = pxToMinutes(getGridY(ev.clientY));
      const s = Math.min(drawDragInfo.current.startMin, curMin);
      const end = Math.max(drawDragInfo.current.startMin, curMin);
      drawDragInfo.current = { startMin: s, endMin: Math.max(end, s + 15) };
      setDrawPreview({ ...drawDragInfo.current });
    }

    function onUp() {
      if (!drawDragInfo.current) return;
      const { startMin, endMin } = drawDragInfo.current;
      drawDragInfo.current = null;
      setDrawPreview(null);
      if (endMin > startMin) {
        setPending({ startTime: minutesToTime(startMin), endTime: minutesToTime(endMin) });
        setTimeout(() => pendingInputRef.current?.focus(), 0);
      }
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    }

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  function commitPending(label) {
    if (label.trim()) {
      onAdd({ label: label.trim(), startTime: pending.startTime, endTime: pending.endTime, recurrence: [] });
    }
    setPending(null);
  }

  // Attach both the grid ref (for Y calculations) and the droppable ref
  function attachGridRef(el) {
    gridRef.current = el;
    setDropRef(el);
    onGridColRef?.(el);
  }

  return (
    <div className="day-grid-wrap">
      <div className="day-grid-scroll" ref={scrollRef}>
        <div className={`day-grid-inner ${isOver && activeQueueTask ? 'grid-drop-active' : ''}`} style={{ height: TOTAL_HEIGHT }}>

          <div className="hour-labels">
            {HOURS.map(h => (
              <div key={h} className="hour-label" style={{ top: (h - START_HOUR) * HOUR_HEIGHT }}>
                {fmt12(h)}
              </div>
            ))}
          </div>

          <div className="grid-col" ref={attachGridRef} onMouseDown={startDraw}>

            {HOURS.map(h => (
              <div key={h} className="grid-line" style={{ top: (h - START_HOUR) * HOUR_HEIGHT }} />
            ))}
            {HOURS.map(h => (
              <div key={`${h}h`} className="grid-line-half" style={{ top: (h - START_HOUR) * HOUR_HEIGHT + HOUR_HEIGHT / 2 }} />
            ))}

            {showNowLine && (
              <div className="now-line" style={{ top: nowY }}>
                <div className="now-dot" />
              </div>
            )}

            {/* Draw preview (drawing a new block by dragging on empty grid) */}
            {drawPreview && (
              <div
                className="tblock-preview"
                style={{
                  top: minutesToPx(drawPreview.startMin),
                  height: Math.max(minutesToPx(drawPreview.endMin) - minutesToPx(drawPreview.startMin), 16),
                }}
              >
                <span className="tblock-preview-time">
                  {fmtTimeStr(minutesToTime(drawPreview.startMin))} – {fmtTimeStr(minutesToTime(drawPreview.endMin))}
                </span>
              </div>
            )}

            {/* Pending block (inline title entry after draw) */}
            {pending && (() => {
              const top = minutesToPx(timeToMinutes(pending.startTime));
              const height = Math.max(minutesToPx(timeToMinutes(pending.endTime)) - top, 36);
              return (
                <div
                  className="tblock-placed tblock-pending"
                  style={{ top, height, '--block-color': 'var(--accent)' }}
                  onClick={e => e.stopPropagation()}
                >
                  <input
                    ref={pendingInputRef}
                    className="tblock-pending-input"
                    placeholder="Name this block…"
                    onKeyDown={e => {
                      if (e.key === 'Enter') commitPending(e.target.value);
                      if (e.key === 'Escape') setPending(null);
                    }}
                    onBlur={e => commitPending(e.target.value)}
                  />
                  {height > 38 && (
                    <div className="tblock-time-label">
                      {fmtTimeStr(pending.startTime)} – {fmtTimeStr(pending.endTime)}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Placed blocks + queue-drag preview — all laid out together */}
            {computeLayout(
              blocks,
              draggingBlock,
              resizingBlock,
              activeQueueTask && isOver && queuePreviewMin !== null
                ? { startMin: queuePreviewMin, endMin: queuePreviewMin + TASK_BLOCK_DURATION }
                : null
            ).map(({ block, startMin, endMin, isDragging, isResizing, col, numCols, isPreview }) => {
              const top = minutesToPx(startMin);
              const left = col === 0 ? '4px' : `calc(${(col / numCols) * 100}% + 2px)`;
              const right = col === numCols - 1 ? '4px' : `calc(${((numCols - col - 1) / numCols) * 100}% + 2px)`;

              if (isPreview) {
                const height = minutesToPx(endMin) - top;
                return (
                  <div key="__preview__" className="tblock-preview tblock-queue-preview" style={{ top, height, left, right }}>
                    <span className="tblock-preview-name">{activeQueueTask.title}</span>
                    <span className="tblock-preview-time">
                      {fmtTimeStr(minutesToTime(startMin))} – {fmtTimeStr(minutesToTime(endMin))}
                    </span>
                  </div>
                );
              }

              const height = Math.max(minutesToPx(endMin) - top - 2, 10);
              const compact = height < 26;
              return (
                <div
                  key={block.id}
                  className={`tblock-placed ${isDragging || isResizing ? 'tblock-dragging' : ''} ${compact ? 'tblock-compact' : ''}`}
                  style={{ top, height, left, right, '--block-color': block.color }}
                  onMouseDown={e => handleBlockMouseDown(e, block)}
                >
                  {height >= 14 && <div className="tblock-name">{block.label}</div>}
                  {height > 38 && (
                    <div className="tblock-time-label">
                      {fmtTimeStr(minutesToTime(startMin))} – {fmtTimeStr(minutesToTime(endMin))}
                    </div>
                  )}
                  {block.recurrence.length > 0 && height > 56 && (
                    <div className="tblock-recur-label">{block.recurrence.join(', ')}</div>
                  )}
                  <div className="tblock-resize-handle" onMouseDown={e => handleResizeMouseDown(e, block)} />
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---- Queue item ----
function QueueItem({ task, isScheduled, onRemove, onUpdate }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    data: { type: 'queue-task' },
  });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`queue-item ${task.done ? 'done' : ''} ${isScheduled ? 'scheduled' : ''}`}
    >
      <span className="task-drag-handle" title="Drag to calendar to schedule" {...attributes} {...listeners}>⠿</span>
      <input
        type="checkbox"
        checked={task.done}
        onChange={e => onUpdate(task.id, { done: e.target.checked })}
      />
      <span className="queue-title">{task.title}</span>
      {isScheduled && <span className="queue-scheduled-badge" title="Scheduled on calendar">◷</span>}
      <button className="icon-btn danger" title="Remove from today" onClick={() => onRemove(task.id)}>×</button>
    </div>
  );
}

// ---- Collision detection: pointer position first, fall back to rect intersection ----
function collisionDetection(args) {
  const pointer = pointerWithin(args);
  return pointer.length > 0 ? pointer : rectIntersection(args);
}

// ---- Date helpers ----
function localDateStr(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return localDateStr(d);
}

function formatDisplayDate(dateStr) {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  });
}

// ---- Quadrant metadata for the matrix pull panel ----
const QUADRANTS_ORDERED = [
  { id: 'ni', label: 'Important · Not Urgent', color: '#5a7a52' },
  { id: 'ui', label: 'Urgent · Important',     color: '#b85c40' },
  { id: 'un', label: 'Urgent · Not Important', color: '#c4923a' },
  { id: 'nn', label: 'Not Urgent · Not Important', color: '#8a7e6e' },
];

// ---- Main component ----
function dateToQuarter(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  const q = Math.ceil((d.getMonth() + 1) / 3);
  return `${d.getFullYear()}-Q${q}`;
}

export function DailyPlanner({
  blocksForDate, addBlock, updateBlock, deleteBlock,
  tasks, getQueueForDate, addToDateQueue, removeFromDateQueue, reorderDateQueue, onUpdateTask,
  focuses, habitLogs, onToggleHabit,
}) {
  const [editingBlock, setEditingBlock] = useState(null);
  const [activeDragTaskId, setActiveDragTaskId] = useState(null);
  const [selectedDate, setSelectedDate] = useState(localDateStr);
  const gridColRef = useRef(null);
  const pointerYRef = useRef(0);

  const todayStr = localDateStr();
  const isToday = selectedDate === todayStr;
  const dateBlocks = blocksForDate(selectedDate);
  const dayQueue = getQueueForDate(selectedDate);

  const queuedTasks = dayQueue.map(id => tasks.find(t => t.id === id)).filter(Boolean);
  const scheduledTaskIds = new Set(dateBlocks.filter(b => b.taskId).map(b => b.taskId));
  const activeQueueTask = activeDragTaskId ? tasks.find(t => t.id === activeDragTaskId) ?? null : null;

  // Tasks available to pull in: undone, not already in this day's queue
  const availableTasks = tasks.filter(t => !t.done && !dayQueue.includes(t.id));

  // Focus priorities for the selected date's quarter
  const plannerQuarter = dateToQuarter(selectedDate);
  const quarterFocuses = (focuses || []).filter(f => f.quarter === plannerQuarter);
  const focusGroups = quarterFocuses
    .map(f => ({ focus: f, tasks: availableTasks.filter(t => t.focusId === f.id) }))
    .filter(g => g.tasks.length > 0);
  const focusTaskIds = new Set(focusGroups.flatMap(g => g.tasks.map(t => t.id)));
  const otherAvailableTasks = availableTasks.filter(t => !focusTaskIds.has(t.id));

  useEffect(() => {
    const fn = e => { pointerYRef.current = e.clientY; };
    window.addEventListener('pointermove', fn);
    return () => window.removeEventListener('pointermove', fn);
  }, []);

  useEffect(() => {
    if (!editingBlock) return;
    const fn = e => { if (e.key === 'Escape') setEditingBlock(null); };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, [editingBlock]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  function handleDragStart({ active }) {
    if (active.data.current?.type === 'queue-task') setActiveDragTaskId(active.id);
  }

  function handleDragEnd({ active, over }) {
    setActiveDragTaskId(null);
    if (!over) return;

    if (over.id === 'day-grid-drop') {
      const task = tasks.find(t => t.id === active.id);
      if (!task || !gridColRef.current) return;
      const rect = gridColRef.current.getBoundingClientRect();
      const startMin = pxToMinutes(pointerYRef.current - rect.top);
      const endMin = Math.min(startMin + TASK_BLOCK_DURATION, END_HOUR * 60);
      addBlock({ label: task.title, startTime: minutesToTime(startMin), endTime: minutesToTime(endMin), recurrence: [], taskId: task.id, date: selectedDate });
      return;
    }

    if (active.id !== over.id) {
      const oldIdx = dayQueue.indexOf(active.id);
      const newIdx = dayQueue.indexOf(over.id);
      if (oldIdx !== -1 && newIdx !== -1) reorderDateQueue(selectedDate, arrayMove(dayQueue, oldIdx, newIdx));
    }
  }

  function handleSaveBlock(data) {
    if (editingBlock) updateBlock(editingBlock.id, data);
    else addBlock({ ...data, date: selectedDate });
    setEditingBlock(null);
  }

  return (
    <DndContext sensors={sensors} collisionDetection={collisionDetection} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="planner-view">
        <div className="planner-nav">
          <button className="nav-day-btn" onClick={() => setSelectedDate(d => addDays(d, -1))}>←</button>
          <div className="planner-nav-center">
            {isToday
              ? <span className="today-badge">Today</span>
              : <button className="btn-ghost small" onClick={() => setSelectedDate(todayStr)}>Today</button>
            }
            <span className="planner-nav-date">{formatDisplayDate(selectedDate)}</span>
          </div>
          <button className="nav-day-btn" onClick={() => setSelectedDate(d => addDays(d, 1))}>→</button>
        </div>

        <div className="planner-columns planner-columns-grid">
          {/* Calendar */}
          <section className="planner-section">
            <div className="section-header">
              <h2>Schedule</h2>
              <span className="hint">Drag to draw a block · drag a task here to schedule it</span>
            </div>
            <DayGrid
              blocks={dateBlocks}
              onAdd={data => addBlock({ ...data, date: selectedDate })}
              onEdit={setEditingBlock}
              onBlockMove={(id, startTime, endTime) => updateBlock(id, { startTime, endTime })}
              activeQueueTask={activeQueueTask}
              onGridColRef={el => { gridColRef.current = el; }}
            />
          </section>

          {/* Right column: two stacked cards */}
          <div className="right-col">
          <section className="planner-section task-panel">
            {/* Committed tasks for this day */}
            <div className="section-header">
              <h2>{isToday ? "Today's Tasks" : "Tasks for this day"}</h2>
            </div>

            <SortableContext items={dayQueue} strategy={verticalListSortingStrategy}>
              <div className="queue-list">
                {queuedTasks.length === 0
                  ? <p className="empty-state">No tasks yet — pull some in below.</p>
                  : queuedTasks.map(task => (
                    <QueueItem
                      key={task.id}
                      task={task}
                      isScheduled={scheduledTaskIds.has(task.id)}
                      onRemove={id => removeFromDateQueue(id, selectedDate)}
                      onUpdate={onUpdateTask}
                    />
                  ))
                }
              </div>
            </SortableContext>
          </section>

          {/* Matrix task browser */}
          <section className="planner-section focus-priorities-panel">
            <div className="pull-panel">
              {availableTasks.length === 0 ? (
                <p className="empty-state">All undone tasks are already added.</p>
              ) : (
                <>
                  {/* Focus priorities first */}
                  {focusGroups.length > 0 && (
                    <>
                      <div className="pull-panel-header">Focus priorities</div>
                      {focusGroups.map(({ focus, tasks: fTasks }) => (
                        <div key={focus.id} className="pull-group">
                          <div className="pull-group-label" style={{ '--q-color': focus.color }}>
                            ● {focus.title || 'Untitled focus'}
                          </div>
                          {fTasks.map(task => (
                            <div key={task.id} className="pull-item pull-item-focus" style={{ '--focus-color': focus.color }}>
                              <span className="pull-item-title">{task.title}</span>
                              <button className="pull-item-add" onClick={() => addToDateQueue(task.id, selectedDate)}>+</button>
                            </div>
                          ))}
                        </div>
                      ))}
                    </>
                  )}

                  {/* Remaining tasks by quadrant */}
                  {otherAvailableTasks.length > 0 && (
                    <>
                      <div className="pull-panel-header" style={focusGroups.length > 0 ? { marginTop: 12 } : {}}>
                        {focusGroups.length > 0 ? 'Other tasks' : 'Pull from matrix'}
                      </div>
                      {QUADRANTS_ORDERED.map(q => {
                        const qTasks = otherAvailableTasks.filter(t => t.quadrant === q.id);
                        if (qTasks.length === 0) return null;
                        return (
                          <div key={q.id} className="pull-group">
                            <div className="pull-group-label" style={{ '--q-color': q.color }}>{q.label}</div>
                            {qTasks.map(task => (
                              <div key={task.id} className="pull-item">
                                <span className="pull-item-title">{task.title}</span>
                                <button className="pull-item-add" onClick={() => addToDateQueue(task.id, selectedDate)}>+</button>
                              </div>
                            ))}
                          </div>
                        );
                      })}
                    </>
                  )}
                </>
              )}
            </div>
          </section>

            <HabitTracker
              selectedDate={selectedDate}
              focuses={focuses}
              habitLogs={habitLogs}
              onToggle={onToggleHabit}
            />
          </div>
        </div>

        {/* Block edit overlay */}
        {editingBlock && (
          <div className="block-edit-overlay" onClick={e => { if (e.target === e.currentTarget) setEditingBlock(null); }}>
            <div className="block-edit-modal">
              <div className="block-edit-modal-header">
                <span className="block-edit-modal-title">Edit block</span>
                <button
                  className="btn-ghost small"
                  style={{ color: 'var(--danger)', borderColor: 'var(--danger)' }}
                  onClick={() => { deleteBlock(editingBlock.id); setEditingBlock(null); }}
                >
                  Delete
                </button>
                <button className="icon-btn" onClick={() => setEditingBlock(null)}>×</button>
              </div>
              <BlockForm initial={editingBlock} onSave={handleSaveBlock} onCancel={() => setEditingBlock(null)} />
            </div>
          </div>
        )}
      </div>
    </DndContext>
  );
}

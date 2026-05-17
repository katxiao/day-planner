import { useState, useRef, useEffect } from 'react';
import { localDateStr } from '../store';
import {
  DndContext, PointerSensor, useSensor, useSensors,
  DragOverlay, closestCenter,
} from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import { useDroppable } from '@dnd-kit/core';
import { TaskCard } from './TaskCard';
import { InboxPanel } from './InboxPanel';

const QUADRANTS = [
  { id: 'ui', label: 'Urgent & Important', sub: 'Do first', color: '#b85c40' },
  { id: 'ni', label: 'Important, Not Urgent', sub: 'Schedule — focus here', color: '#5a7a52', focus: true },
  { id: 'un', label: 'Urgent, Not Important', sub: 'Delegate', color: '#c4923a' },
  { id: 'nn', label: 'Not Urgent, Not Important', sub: 'Eliminate', color: '#8a7e6e' },
];

// keyboard key → quadrant id
const KEY_TO_QUADRANT = { '1': 'ui', '2': 'ni', '3': 'un', '4': 'nn' };

function formatScheduledDate(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  const diffDays = Math.round((d - new Date()) / 86400000);
  if (diffDays === 1) return 'Tomorrow';
  if (diffDays < 7) return d.toLocaleDateString('en-US', { weekday: 'short' });
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function Quadrant({ quadrant, tasks, today, onUpdate, onDelete, onAddToQueue, onUnschedule, focuses, isCollapsed, onToggle }) {
  const { setNodeRef, isOver } = useDroppable({ id: quadrant.id });
  const sortedTasks = [...tasks].sort((a, b) => (a.done ? 1 : 0) - (b.done ? 1 : 0));

  return (
    <div
      ref={setNodeRef}
      className={`quadrant ${isOver ? 'quadrant-over' : ''} ${quadrant.focus ? 'quadrant-focus' : ''} ${isCollapsed ? 'quadrant-collapsed' : ''}`}
      style={{ '--q-color': quadrant.color }}
    >
      <div className="quadrant-header">
        <span className="quadrant-label">{quadrant.label}</span>
        <span className="quadrant-sub">{quadrant.sub}</span>
        {isCollapsed && tasks.length > 0 && (
          <span className="quadrant-count">{tasks.length}</span>
        )}
        <button
          className="quadrant-toggle"
          onClick={onToggle}
          title={isCollapsed ? 'Expand' : 'Collapse'}
        >
          {isCollapsed ? '▸' : '▾'}
        </button>
      </div>
      {!isCollapsed && (
        <SortableContext items={sortedTasks.map(t => t.id)} strategy={verticalListSortingStrategy}>
          <div className="quadrant-tasks">
            {sortedTasks.map(task => (
              <TaskCard
                key={task.id}
                task={task}
                onUpdate={onUpdate}
                onDelete={onDelete}
                onAddToQueue={onAddToQueue}
                onUnschedule={onUnschedule}
                inQueue={task.scheduledDate === today}
                scheduledDate={task.scheduledDate && task.scheduledDate !== today ? task.scheduledDate : null}
                focuses={focuses}
              />
            ))}
          </div>
        </SortableContext>
      )}
    </div>
  );
}

export function Matrix({
  tasks, onUpdate, onDelete, onAddTask, onAddToQueue, onUnschedule, reorderTasks, moveTask,
  inbox, onAddToInbox, onDeleteFromInbox, onMoveFromInboxToQuadrant, onReorderInbox,
  focuses,
}) {
  const today = localDateStr();
  const [activeId, setActiveId] = useState(null);
  const [activeType, setActiveType] = useState(null); // 'task' | 'inbox'
  const [selectedInboxId, setSelectedInboxId] = useState(null);
  const [inboxOpen, setInboxOpen] = useState(true);
  const [collapsedQuadrants, setCollapsedQuadrants] = useState(() => new Set(['un', 'nn']));

  function toggleQuadrant(id) {
    setCollapsedQuadrants(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  const addInputRef = useRef(null);

  useEffect(() => {
    function onKey(e) {
      if (e.target.matches('input,textarea')) return;

      // Arrow key navigation between inbox items
      if (inboxOpen && inbox.length > 0 && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
        e.preventDefault();
        const currentIdx = inbox.findIndex(i => i.id === selectedInboxId);
        if (e.key === 'ArrowRight') {
          const nextIdx = currentIdx === -1 ? 0 : Math.min(currentIdx + 1, inbox.length - 1);
          setSelectedInboxId(inbox[nextIdx].id);
        } else {
          const prevIdx = currentIdx === -1 ? inbox.length - 1 : Math.max(currentIdx - 1, 0);
          setSelectedInboxId(inbox[prevIdx].id);
        }
        return;
      }

      // Keyboard categorization / deletion when inbox item selected
      if (selectedInboxId) {
        if (KEY_TO_QUADRANT[e.key]) {
          const currentIdx = inbox.findIndex(i => i.id === selectedInboxId);
          const nextItem = inbox[currentIdx + 1] ?? inbox[currentIdx - 1] ?? null;
          onMoveFromInboxToQuadrant(selectedInboxId, KEY_TO_QUADRANT[e.key]);
          setSelectedInboxId(nextItem?.id ?? null);
          return;
        }
        if (e.key === 'Delete' || e.key === 'Backspace') {
          const currentIdx = inbox.findIndex(i => i.id === selectedInboxId);
          const nextItem = inbox[currentIdx + 1] ?? inbox[currentIdx - 1] ?? null;
          onDeleteFromInbox(selectedInboxId);
          setSelectedInboxId(nextItem?.id ?? null);
          return;
        }
        if (e.key === 'Escape') {
          setSelectedInboxId(null);
          return;
        }
      }

      if (e.key === 'n' || e.key === 'N') {
        if (!inboxOpen) setInboxOpen(true);
        setTimeout(() => addInputRef.current?.focus(), 50);
        return;
      }
      if (e.key === 'Escape') {
        setSelectedInboxId(null);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedInboxId, inboxOpen, inbox, onMoveFromInboxToQuadrant, onDeleteFromInbox]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const activeTask = tasks.find(t => t.id === activeId);
  const activeInboxItem = inbox.find(i => i.id === activeId);

  function handleDragStart({ active }) {
    setActiveId(active.id);
    setActiveType(active.data.current?.type ?? 'task');
  }

  function handleDragEnd({ active, over }) {
    setActiveId(null);
    setActiveType(null);
    if (!over) return;

    const dragType = active.data.current?.type ?? 'task';

    if (dragType === 'inbox') {
      const targetQuadrant = QUADRANTS.find(q => q.id === over.id);
      if (targetQuadrant) {
        onMoveFromInboxToQuadrant(active.id, targetQuadrant.id);
        return;
      }
      const toTask = tasks.find(t => t.id === over.id);
      if (toTask) {
        onMoveFromInboxToQuadrant(active.id, toTask.quadrant);
        return;
      }
      const oldIdx = inbox.findIndex(i => i.id === active.id);
      const newIdx = inbox.findIndex(i => i.id === over.id);
      if (oldIdx !== -1 && newIdx !== -1) {
        onReorderInbox(arrayMove(inbox, oldIdx, newIdx).map(i => i.id));
      }
      return;
    }

    const fromTask = tasks.find(t => t.id === active.id);
    if (!fromTask) return;

    const targetQuadrant = QUADRANTS.find(q => q.id === over.id);
    if (targetQuadrant) {
      if (fromTask.quadrant !== targetQuadrant.id) moveTask(active.id, targetQuadrant.id);
      return;
    }

    const toTask = tasks.find(t => t.id === over.id);
    if (!toTask) return;

    if (fromTask.quadrant === toTask.quadrant) {
      const quadrantTasks = tasks.filter(t => t.quadrant === fromTask.quadrant);
      const oldIdx = quadrantTasks.findIndex(t => t.id === active.id);
      const newIdx = quadrantTasks.findIndex(t => t.id === over.id);
      const reordered = arrayMove(quadrantTasks, oldIdx, newIdx);
      reorderTasks(fromTask.quadrant, reordered.map(t => t.id));
    } else {
      moveTask(active.id, toTask.quadrant);
    }
  }

  return (
    <div className="matrix-view">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <InboxPanel
          inbox={inbox}
          onAdd={onAddToInbox}
          onDelete={onDeleteFromInbox}
          selectedId={selectedInboxId}
          onSelect={id => setSelectedInboxId(prev => prev === id ? null : id)}
          addInputRef={addInputRef}
          isOpen={inboxOpen}
          onToggle={() => setInboxOpen(o => !o)}
          quadrants={QUADRANTS}
          onAddTask={onAddTask}
        />

        <div className="matrix-grid">
          {QUADRANTS.map(q => (
            <Quadrant
              key={q.id}
              quadrant={q}
              tasks={tasks.filter(t => t.quadrant === q.id && (!t.done || (t.completedAt && localDateStr(new Date(t.completedAt)) === today)))}
              today={today}
              onUpdate={onUpdate}
              onDelete={onDelete}
              onAddToQueue={onAddToQueue}
              onUnschedule={onUnschedule}
              focuses={focuses}
              isCollapsed={collapsedQuadrants.has(q.id)}
              onToggle={() => toggleQuadrant(q.id)}
            />
          ))}
        </div>

        <DragOverlay>
          {activeType === 'inbox' && activeInboxItem ? (
            <div className="inbox-chip drag-overlay-chip">
              <span>{activeInboxItem.title}</span>
            </div>
          ) : activeTask ? (
            <div className="task-card drag-overlay">
              <span>{activeTask.title}</span>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}

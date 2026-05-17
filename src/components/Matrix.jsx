import { useState, useRef, useEffect } from 'react';
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

function Quadrant({ quadrant, tasks, onUpdate, onDelete, onAddToQueue, queueIds, focuses }) {
  const { setNodeRef, isOver } = useDroppable({ id: quadrant.id });

  return (
    <div
      ref={setNodeRef}
      className={`quadrant ${isOver ? 'quadrant-over' : ''} ${quadrant.focus ? 'quadrant-focus' : ''}`}
      style={{ '--q-color': quadrant.color }}
    >
      <div className="quadrant-header">
        <span className="quadrant-label">{quadrant.label}</span>
        <span className="quadrant-sub">{quadrant.sub}</span>
      </div>
      <SortableContext items={tasks.map(t => t.id)} strategy={verticalListSortingStrategy}>
        <div className="quadrant-tasks">
          {tasks.map(task => (
            <TaskCard
              key={task.id}
              task={task}
              onUpdate={onUpdate}
              onDelete={onDelete}
              onAddToQueue={onAddToQueue}
              inQueue={queueIds.includes(task.id)}
              focuses={focuses}
            />
          ))}
        </div>
      </SortableContext>
    </div>
  );
}

export function Matrix({
  tasks, onUpdate, onDelete, onAddTask, onAddToQueue, dayQueue, reorderTasks, moveTask,
  inbox, onAddToInbox, onDeleteFromInbox, onMoveFromInboxToQuadrant, onReorderInbox,
  focuses,
}) {
  const [addingTo, setAddingTo] = useState(null);
  const [newTitle, setNewTitle] = useState('');
  const [activeId, setActiveId] = useState(null);
  const [activeType, setActiveType] = useState(null); // 'task' | 'inbox'
  const [selectedInboxId, setSelectedInboxId] = useState(null);
  const [inboxOpen, setInboxOpen] = useState(true);
  const addInputRef = useRef(null);
  const quickAddRef = useRef(null);

  useEffect(() => {
    if (addingTo) quickAddRef.current?.focus();
  }, [addingTo]);

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
          // pick next item before removing current one
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
        setAddingTo(null);
        setNewTitle('');
        setSelectedInboxId(null);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedInboxId, inboxOpen, inbox, onMoveFromInboxToQuadrant, onDeleteFromInbox]);

  function submitNew(e) {
    e.preventDefault();
    if (newTitle.trim()) {
      onAddTask({ title: newTitle.trim(), quadrant: addingTo });
      setNewTitle('');
      quickAddRef.current?.focus();
    }
  }

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
      // Inbox item dropped onto a quadrant zone or a task inside a quadrant
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
      // Reorder within inbox
      const oldIdx = inbox.findIndex(i => i.id === active.id);
      const newIdx = inbox.findIndex(i => i.id === over.id);
      if (oldIdx !== -1 && newIdx !== -1) {
        onReorderInbox(arrayMove(inbox, oldIdx, newIdx).map(i => i.id));
      }
      return;
    }

    // Existing task drag
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
      <div className="matrix-toolbar">
        <div className="matrix-toolbar-hints">
          <span className="matrix-toolbar-hint">
            <kbd>N</kbd> to add to inbox · drag inbox items to a quadrant · click item then <kbd>1</kbd>–<kbd>4</kbd> to categorize
          </span>
        </div>
        {QUADRANTS.map(q => (
          <button
            key={q.id}
            className="add-btn"
            style={{ '--q-color': q.color }}
            onClick={() => setAddingTo(q.id === addingTo ? null : q.id)}
          >
            + {q.id === 'ni' ? 'Schedule' : q.sub}
          </button>
        ))}
      </div>

      {addingTo && (
        <form className="quick-add" onSubmit={submitNew}>
          <span className="quick-add-label">
            Adding to: <strong>{QUADRANTS.find(q => q.id === addingTo)?.label}</strong>
          </span>
          <input
            ref={quickAddRef}
            className="quick-add-input"
            value={newTitle}
            onChange={e => setNewTitle(e.target.value)}
            placeholder="Task title… (Enter to save, Esc to cancel)"
            onKeyDown={e => { if (e.key === 'Escape') { setAddingTo(null); setNewTitle(''); } }}
          />
          <button type="submit" className="btn-primary">Add</button>
          <button type="button" className="btn-ghost" onClick={() => { setAddingTo(null); setNewTitle(''); }}>Cancel</button>
        </form>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="matrix-grid">
          {QUADRANTS.map(q => (
            <Quadrant
              key={q.id}
              quadrant={q}
              tasks={tasks.filter(t => t.quadrant === q.id)}
              onUpdate={onUpdate}
              onDelete={onDelete}
              onAddToQueue={onAddToQueue}
              queueIds={dayQueue}
              focuses={focuses}
            />
          ))}
        </div>

        <InboxPanel
          inbox={inbox}
          onAdd={onAddToInbox}
          onDelete={onDeleteFromInbox}
          selectedId={selectedInboxId}
          onSelect={id => setSelectedInboxId(prev => prev === id ? null : id)}
          addInputRef={addInputRef}
          isOpen={inboxOpen}
          onToggle={() => setInboxOpen(o => !o)}
        />

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

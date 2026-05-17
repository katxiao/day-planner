import { useState, useRef, useEffect } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

export function TaskCard({ task, onUpdate, onDelete, onAddToQueue, inQueue, focuses }) {
  const [expanded, setExpanded] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleVal, setTitleVal] = useState(task.title);
  const titleRef = useRef(null);

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  useEffect(() => {
    if (editingTitle) titleRef.current?.focus();
  }, [editingTitle]);

  function commitTitle() {
    if (titleVal.trim()) onUpdate(task.id, { title: titleVal.trim() });
    else setTitleVal(task.title);
    setEditingTitle(false);
  }

  const linkedFocus = focuses?.find(f => f.id === task.focusId);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`task-card ${task.done ? 'done' : ''}`}
    >
      <div className="task-card-header">
        <div className="task-drag-handle" {...attributes} {...listeners}>⠿</div>
        <input
          type="checkbox"
          checked={task.done}
          onChange={e => onUpdate(task.id, { done: e.target.checked })}
          className="task-checkbox"
        />
        {editingTitle ? (
          <input
            ref={titleRef}
            className="task-title-input"
            value={titleVal}
            onChange={e => setTitleVal(e.target.value)}
            onBlur={commitTitle}
            onKeyDown={e => { if (e.key === 'Enter') commitTitle(); if (e.key === 'Escape') { setTitleVal(task.title); setEditingTitle(false); } }}
          />
        ) : (
          <span className="task-title" onDoubleClick={() => setEditingTitle(true)}>{task.title}</span>
        )}
        {linkedFocus && (
          <span
            className="task-focus-badge"
            style={{ '--focus-color': linkedFocus.color }}
            title={linkedFocus.title || 'Focus'}
          >
            ● {linkedFocus.title || '…'}
          </span>
        )}
        <div className="task-actions">
          <button
            className={`icon-btn queue-btn ${inQueue ? 'in-queue' : ''}`}
            title={inQueue ? "Already in today's planner" : "Add to today's planner"}
            onClick={() => onAddToQueue(task.id)}
          >
            {inQueue ? '✓ Today' : '→ Today'}
          </button>
          <button className="icon-btn" title="Toggle notes" onClick={() => setExpanded(e => !e)}>
            {expanded ? '▲' : '▼'}
          </button>
          <button className="icon-btn danger" title="Delete task" onClick={() => onDelete(task.id)}>×</button>
        </div>
      </div>
      {expanded && (
        <>
          <textarea
            className="task-notes"
            placeholder="Notes…"
            value={task.notes}
            onChange={e => onUpdate(task.id, { notes: e.target.value })}
          />
          {focuses && focuses.length > 0 && (
            <select
              className="task-focus-picker"
              value={task.focusId || ''}
              onChange={e => onUpdate(task.id, { focusId: e.target.value || undefined })}
            >
              <option value="">No focus linked</option>
              {focuses.map(f => (
                <option key={f.id} value={f.id}>
                  {f.quarter} — {f.title || 'Untitled'}
                </option>
              ))}
            </select>
          )}
        </>
      )}
    </div>
  );
}

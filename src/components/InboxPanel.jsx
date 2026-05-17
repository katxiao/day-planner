import { useState, useRef } from 'react';
import { SortableContext, horizontalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

function InboxChip({ item, isSelected, onSelect, onDelete }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
    data: { type: 'inbox' },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.35 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`inbox-chip ${isSelected ? 'selected' : ''}`}
      onClick={() => onSelect(item.id)}
    >
      <span className="inbox-chip-handle" {...attributes} {...listeners}>⠿</span>
      <span className="inbox-chip-title">{item.title}</span>
      <button
        className="inbox-chip-delete"
        onClick={e => { e.stopPropagation(); onDelete(item.id); }}
        title="Remove from inbox"
      >×</button>
    </div>
  );
}

export function InboxPanel({
  inbox, onAdd, onDelete, selectedId, onSelect, addInputRef, isOpen, onToggle,
  quadrants, onAddTask,
}) {
  const [inputVal, setInputVal] = useState('');
  const [addingTo, setAddingTo] = useState(null);
  const [newTitle, setNewTitle] = useState('');
  const quickAddRef = useRef(null);

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const title = inputVal.trim();
      if (title) {
        onAdd(title);
        setInputVal('');
      }
    }
    if (e.key === 'Escape') {
      addInputRef.current?.blur();
    }
  }

  function handlePaste(e) {
    const text = e.clipboardData.getData('text');
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length > 1) {
      e.preventDefault();
      lines.forEach(line => onAdd(line));
    }
  }

  function submitNew(e) {
    e.preventDefault();
    if (newTitle.trim()) {
      onAddTask({ title: newTitle.trim(), quadrant: addingTo });
      setNewTitle('');
      quickAddRef.current?.focus();
    }
  }

  function openQuickAdd(qid) {
    setAddingTo(qid === addingTo ? null : qid);
    setNewTitle('');
    if (qid !== addingTo) {
      setTimeout(() => quickAddRef.current?.focus(), 50);
    }
  }

  return (
    <div className={`inbox-panel ${isOpen ? 'open' : ''}`}>
      <div className="inbox-header" onClick={onToggle}>
        <span className="inbox-title">
          Inbox
          {inbox.length > 0 && <span className="inbox-count">{inbox.length}</span>}
        </span>

        {selectedId ? (
          <span className="inbox-header-hint">
            Press <kbd>1</kbd>–<kbd>4</kbd> to assign · <kbd>Del</kbd> to remove · <kbd>Esc</kbd> to deselect
          </span>
        ) : (
          <div className="inbox-header-actions" onClick={e => e.stopPropagation()}>
            {quadrants.map(q => (
              <button
                key={q.id}
                className={`inbox-add-quadrant-btn ${addingTo === q.id ? 'active' : ''}`}
                style={{ '--q-color': q.color }}
                onClick={() => openQuickAdd(q.id)}
                title={`Add directly to ${q.label}`}
              >
                + {q.id === 'ni' ? 'Schedule' : q.sub}
              </button>
            ))}
          </div>
        )}

        <button className="inbox-toggle" onClick={e => { e.stopPropagation(); onToggle(); }}>
          {isOpen ? '▼' : '▲'}
        </button>
      </div>

      {isOpen && (
        <div className="inbox-body">
          {addingTo && (
            <form className="inbox-quick-add" onSubmit={submitNew}>
              <span className="inbox-quick-add-label">
                Adding to: <strong>{quadrants.find(q => q.id === addingTo)?.label}</strong>
              </span>
              <input
                ref={quickAddRef}
                className="quick-add-input"
                value={newTitle}
                onChange={e => setNewTitle(e.target.value)}
                placeholder="Task title… (Enter to save, Esc to cancel)"
                onKeyDown={e => {
                  if (e.key === 'Escape') { setAddingTo(null); setNewTitle(''); }
                }}
              />
              <button type="submit" className="btn-primary small">Add</button>
              <button type="button" className="btn-ghost small" onClick={() => { setAddingTo(null); setNewTitle(''); }}>Cancel</button>
            </form>
          )}

          <SortableContext items={inbox.map(i => i.id)} strategy={horizontalListSortingStrategy}>
            <div className="inbox-chips">
              {inbox.length === 0 && !addingTo && (
                <span className="inbox-empty">Brain dump here — type below to add tasks</span>
              )}
              {inbox.map(item => (
                <InboxChip
                  key={item.id}
                  item={item}
                  isSelected={selectedId === item.id}
                  onSelect={onSelect}
                  onDelete={onDelete}
                />
              ))}
            </div>
          </SortableContext>

          <div className="inbox-add-row">
            <input
              ref={addInputRef}
              className="inbox-add-input"
              value={inputVal}
              onChange={e => setInputVal(e.target.value)}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              placeholder="Type and press Enter · paste multiple lines to add in bulk"
            />
          </div>
        </div>
      )}
    </div>
  );
}

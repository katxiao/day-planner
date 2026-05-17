import { useState } from 'react';
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

export function InboxPanel({ inbox, onAdd, onDelete, selectedId, onSelect, addInputRef, isOpen, onToggle }) {
  const [inputVal, setInputVal] = useState('');

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

  return (
    <div className={`inbox-panel ${isOpen ? 'open' : ''}`}>
      <div className="inbox-header" onClick={onToggle}>
        <span className="inbox-title">
          Inbox
          {inbox.length > 0 && <span className="inbox-count">{inbox.length}</span>}
        </span>
        <span className="inbox-header-hint">
          {selectedId
            ? <>Press <kbd>1</kbd>–<kbd>4</kbd> to assign · <kbd>Del</kbd> to remove · <kbd>Esc</kbd> to deselect</>
            : isOpen
            ? <>Drag to a quadrant · click to select · <kbd>N</kbd> to add</>
            : null
          }
        </span>
        <button className="inbox-toggle" onClick={e => { e.stopPropagation(); onToggle(); }}>
          {isOpen ? '▼' : '▲'}
        </button>
      </div>

      {isOpen && (
        <div className="inbox-body">
          <SortableContext items={inbox.map(i => i.id)} strategy={horizontalListSortingStrategy}>
            <div className="inbox-chips">
              {inbox.length === 0 && (
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

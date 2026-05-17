import { useState } from 'react';

const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#f97316'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function BlockForm({ initial, onSave, onCancel }) {
  const [label, setLabel] = useState(initial?.label || '');
  const [startTime, setStartTime] = useState(initial?.startTime || '09:00');
  const [endTime, setEndTime] = useState(initial?.endTime || '10:00');
  const [color, setColor] = useState(initial?.color || '#6366f1');
  const [recurrence, setRecurrence] = useState(initial?.recurrence || []);

  function toggleDay(day) {
    setRecurrence(r => r.includes(day) ? r.filter(d => d !== day) : [...r, day]);
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (!label.trim()) return;
    onSave({ label: label.trim(), startTime, endTime, color, recurrence });
  }

  return (
    <form className="block-form" onSubmit={handleSubmit}>
      <div className="form-row">
        <label>Label</label>
        <input value={label} onChange={e => setLabel(e.target.value)} placeholder="e.g. Morning run" autoFocus />
      </div>
      <div className="form-row">
        <label>Start</label>
        <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} />
        <label>End</label>
        <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} />
      </div>
      <div className="form-row">
        <label>Color</label>
        <div className="color-picks">
          {COLORS.map(c => (
            <button
              key={c}
              type="button"
              className={`color-pick ${color === c ? 'selected' : ''}`}
              style={{ background: c }}
              onClick={() => setColor(c)}
            />
          ))}
        </div>
      </div>
      <div className="form-row">
        <label>Repeat</label>
        <div className="day-picks">
          {DAYS.map(d => (
            <button
              key={d}
              type="button"
              className={`day-pick ${recurrence.includes(d) ? 'selected' : ''}`}
              onClick={() => toggleDay(d)}
            >
              {d}
            </button>
          ))}
        </div>
        {recurrence.length === 0 && <span className="hint-sm">No days selected = show every day</span>}
      </div>
      <div className="form-actions">
        <button type="submit" className="btn-primary">Save</button>
        <button type="button" className="btn-ghost" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}

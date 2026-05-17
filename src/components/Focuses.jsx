import { useState } from 'react';
import { FOCUS_COLORS } from '../store';

const HABIT_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DAY_SHORT  = { Mon: 'Mo', Tue: 'Tu', Wed: 'We', Thu: 'Th', Fri: 'Fr', Sat: 'Sa', Sun: 'Su' };

// ---- Quarter helpers ----
function currentQuarter() {
  const d = new Date();
  const q = Math.ceil((d.getMonth() + 1) / 3);
  return `${d.getFullYear()}-Q${q}`;
}

const QUARTER_MONTHS = { Q1: 'Jan – Mar', Q2: 'Apr – Jun', Q3: 'Jul – Sep', Q4: 'Oct – Dec' };

function quarterLabel(str) {
  const [year, q] = str.split('-');
  return `${q} ${year} · ${QUARTER_MONTHS[q]}`;
}

function shiftQuarter(str, delta) {
  const [yearStr, qStr] = str.split('-Q');
  let year = Number(yearStr);
  let q = Number(qStr) + delta;
  if (q < 1) { q = 4; year--; }
  if (q > 4) { q = 1; year++; }
  return `${year}-Q${q}`;
}

// Fallback for focuses created before the color field was added
const CARD_COLORS = FOCUS_COLORS;

// ---- Focus card ----
function FocusCard({ focus, color, onUpdate, onDelete, onAddHabit, onRemoveHabit, onUpdateHabitDays, onAddTask, onRemoveTask, onSendToMatrix }) {
  const [habitInput, setHabitInput] = useState('');
  const [taskInput, setTaskInput] = useState('');

  function handleAddTask(title) {
    onAddTask(title);
    onSendToMatrix(title, focus.id);
  }

  return (
    <div className="focus-card" style={{ '--focus-color': color }}>
      <div className="focus-card-top">
        <input
          className="focus-title-input"
          value={focus.title}
          onChange={e => onUpdate({ title: e.target.value })}
          placeholder="Theme title…"
        />
        <button className="icon-btn danger" onClick={onDelete} title="Remove focus">×</button>
      </div>

      <div className="focus-hypothesis">
        <div className="hypothesis-row">
          <span className="hypothesis-if">If I</span>
          <input
            className="hypothesis-input"
            value={focus.hypothesisAction}
            onChange={e => onUpdate({ hypothesisAction: e.target.value })}
            placeholder="run 3x a week…"
          />
        </div>
        <div className="hypothesis-connector">↓</div>
        <div className="hypothesis-row">
          <span className="hypothesis-if">I will</span>
          <input
            className="hypothesis-input"
            value={focus.hypothesisOutcome}
            onChange={e => onUpdate({ hypothesisOutcome: e.target.value })}
            placeholder="have more energy…"
          />
        </div>
      </div>

      <div className="focus-section">
        <div className="focus-section-label">Measurable outcome</div>
        <input
          className="focus-field-input"
          value={focus.measurableOutcome}
          onChange={e => onUpdate({ measurableOutcome: e.target.value })}
          placeholder="e.g. 12 runs per month"
        />
      </div>

      <div className="focus-section">
        <div className="focus-section-label">Recurring habits</div>
        <div className="focus-list">
          {focus.habits.map(h => {
            const days = h.days || [];
            return (
              <div key={h.id} className="focus-habit-row">
                <div className="focus-habit-top">
                  <span className="focus-list-dot" />
                  <span className="focus-list-text">{h.title}</span>
                  <button className="icon-btn danger" onClick={() => onRemoveHabit(h.id)}>×</button>
                </div>
                <div className="focus-habit-days">
                  {HABIT_DAYS.map(day => (
                    <button
                      key={day}
                      className={`focus-day-chip ${days.includes(day) ? 'active' : ''}`}
                      onClick={() => {
                        const next = days.includes(day) ? days.filter(d => d !== day) : [...days, day];
                        onUpdateHabitDays(h.id, next);
                      }}
                      title={day}
                    >
                      {DAY_SHORT[day]}
                    </button>
                  ))}
                  {days.length === 0 && <span className="focus-day-hint">every day</span>}
                </div>
              </div>
            );
          })}
        </div>
        <input
          className="focus-add-input"
          value={habitInput}
          onChange={e => setHabitInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && habitInput.trim()) {
              onAddHabit(habitInput.trim());
              setHabitInput('');
            }
            if (e.key === 'Escape') setHabitInput('');
          }}
          placeholder="Add habit… Enter to save"
        />
      </div>

      <div className="focus-section">
        <div className="focus-section-label">Setup tasks</div>
        <div className="focus-list">
          {focus.setupTasks.map(t => (
            <div key={t.id} className="focus-list-item">
              <span className="focus-list-dot" />
              <span className="focus-list-text">{t.title}</span>
              <button className="icon-btn danger" onClick={() => onRemoveTask(t.id)} title="Remove task">×</button>
            </div>
          ))}
        </div>
        <input
          className="focus-add-input"
          value={taskInput}
          onChange={e => setTaskInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && taskInput.trim()) {
              handleAddTask(taskInput.trim());
              setTaskInput('');
            }
            if (e.key === 'Escape') setTaskInput('');
          }}
          placeholder="Add task… Enter to save"
        />
      </div>
    </div>
  );
}

// ---- Idea card ----
function IdeaCard({ idea, onUpdate, onDelete, onPromote, promoted, canPromote, quarterShort }) {
  return (
    <div className="idea-card">
      <div className="focus-card-top">
        <input
          className="focus-title-input"
          value={idea.title}
          onChange={e => onUpdate({ title: e.target.value })}
          placeholder="Theme idea…"
        />
        <button className="icon-btn danger" onClick={onDelete}>×</button>
      </div>

      <div className="focus-hypothesis">
        <div className="hypothesis-row">
          <span className="hypothesis-if">If I</span>
          <input
            className="hypothesis-input"
            value={idea.hypothesisAction}
            onChange={e => onUpdate({ hypothesisAction: e.target.value })}
            placeholder="…"
          />
        </div>
        <div className="hypothesis-connector">↓</div>
        <div className="hypothesis-row">
          <span className="hypothesis-if">I will</span>
          <input
            className="hypothesis-input"
            value={idea.hypothesisOutcome}
            onChange={e => onUpdate({ hypothesisOutcome: e.target.value })}
            placeholder="…"
          />
        </div>
      </div>

      <div className="idea-card-footer">
        <button
          className={`focus-send-btn ${promoted ? 'sent' : ''}`}
          onClick={onPromote}
          disabled={!canPromote}
          title={canPromote ? `Add to ${quarterShort}` : 'Quarter already has 4 focuses'}
        >
          {promoted ? '✓ Added' : `→ ${quarterShort}`}
        </button>
      </div>
    </div>
  );
}

// ---- Ideas bank ----
function IdeasBank({ ideas, onAdd, onUpdate, onDelete, onPromote, quarter, quarterFocusCount }) {
  const [open, setOpen] = useState(false);
  const [promotedIds, setPromotedIds] = useState(new Set());
  const quarterShort = quarter.split('-')[1]; // e.g. "Q2"

  function handlePromote(id) {
    onPromote(id, quarter);
    setPromotedIds(prev => new Set([...prev, id]));
    setTimeout(() => setPromotedIds(prev => { const n = new Set(prev); n.delete(id); return n; }), 2000);
  }

  return (
    <div className="ideas-bank">
      <div className="ideas-bank-header" onClick={() => setOpen(o => !o)}>
        <span className="ideas-bank-title">Ideas Bank</span>
        {ideas.length > 0 && <span className="inbox-count">{ideas.length}</span>}
        <span className="ideas-bank-hint">future focuses &amp; hypotheses</span>
        <button className="icon-btn" onClick={e => { e.stopPropagation(); setOpen(o => !o); }}>
          {open ? '▼' : '▲'}
        </button>
      </div>

      {open && (
        <div className="ideas-bank-body">
          <div className="focuses-grid">
            {ideas.map(idea => (
              <IdeaCard
                key={idea.id}
                idea={idea}
                onUpdate={patch => onUpdate(idea.id, patch)}
                onDelete={() => onDelete(idea.id)}
                onPromote={() => handlePromote(idea.id)}
                promoted={promotedIds.has(idea.id)}
                canPromote={quarterFocusCount < 4}
                quarterShort={quarterShort}
              />
            ))}
            <button className="focus-add-card" onClick={onAdd}>
              <span className="focus-add-icon">+</span>
              <span>New idea</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---- Main component ----
export function Focuses({
  focuses, addFocus, updateFocus, deleteFocus,
  addHabitToFocus, removeHabitFromFocus, updateHabitDays,
  addSetupTaskToFocus, removeSetupTaskFromFocus,
  addToInbox,
  focusIdeas, addFocusIdea, updateFocusIdea, deleteFocusIdea, promoteFocusIdea,
}) {
  const [quarter, setQuarter] = useState(currentQuarter);
  const thisQuarter = currentQuarter();
  const quarterFocuses = focuses.filter(f => f.quarter === quarter);
  const canAdd = quarterFocuses.length < 4;

  return (
    <div className="focuses-view">
      <div className="planner-nav">
        <button className="nav-day-btn" onClick={() => setQuarter(q => shiftQuarter(q, -1))}>←</button>
        <div className="planner-nav-center">
          {quarter === thisQuarter
            ? <span className="today-badge">This quarter</span>
            : <button className="btn-ghost small" onClick={() => setQuarter(thisQuarter)}>This quarter</button>
          }
          <span className="planner-nav-date">{quarterLabel(quarter)}</span>
        </div>
        <button className="nav-day-btn" onClick={() => setQuarter(q => shiftQuarter(q, 1))}>→</button>
      </div>

      <div className="focuses-grid">
        {quarterFocuses.map((focus, idx) => (
          <FocusCard
            key={focus.id}
            focus={focus}
            color={focus.color || CARD_COLORS[idx % CARD_COLORS.length]}
            onUpdate={patch => updateFocus(focus.id, patch)}
            onDelete={() => deleteFocus(focus.id)}
            onAddHabit={title => addHabitToFocus(focus.id, title)}
            onRemoveHabit={id => removeHabitFromFocus(focus.id, id)}
            onUpdateHabitDays={(habitId, days) => updateHabitDays(focus.id, habitId, days)}
            onAddTask={title => addSetupTaskToFocus(focus.id, title)}
            onRemoveTask={id => removeSetupTaskFromFocus(focus.id, id)}
            onSendToMatrix={addToInbox}
          />
        ))}

        {canAdd && (
          <button className="focus-add-card" onClick={() => addFocus(quarter)}>
            <span className="focus-add-icon">+</span>
            <span>Add focus</span>
          </button>
        )}
      </div>

      {quarterFocuses.length === 0 && (
        <p className="focuses-empty">No focuses for {quarterLabel(quarter)} yet. Add up to 4 themes above.</p>
      )}

      <IdeasBank
        ideas={focusIdeas}
        onAdd={addFocusIdea}
        onUpdate={updateFocusIdea}
        onDelete={deleteFocusIdea}
        onPromote={promoteFocusIdea}
        quarter={quarter}
        quarterFocusCount={quarterFocuses.length}
      />
    </div>
  );
}

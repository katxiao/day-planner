import { useState } from 'react';
import { localDateStr } from '../store';

// Mon-first week order for display
const WEEK_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DAY_SHORT  = { Mon: 'Mo', Tue: 'Tu', Wed: 'We', Thu: 'Th', Fri: 'Fr', Sat: 'Sa', Sun: 'Su' };

function dateToQuarter(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  return `${d.getFullYear()}-Q${Math.ceil((d.getMonth() + 1) / 3)}`;
}

function getWeekDates(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  const dow = d.getDay(); // 0=Sun … 6=Sat
  const toMonday = dow === 0 ? -6 : 1 - dow;
  return WEEK_DAYS.map((_, i) => {
    const day = new Date(d);
    day.setDate(d.getDate() + toMonday + i);
    return localDateStr(day);
  });
}

export function HabitTracker({ selectedDate, focuses, habitLogs, onToggle }) {
  const [open, setOpen] = useState(true);
  const today = localDateStr();
  const weekDates = getWeekDates(selectedDate);

  // Gather habits from current quarter's focuses
  const quarter = dateToQuarter(selectedDate);
  const habits = (focuses || [])
    .filter(f => f.quarter === quarter)
    .flatMap(f => f.habits.map(h => ({ ...h, focusColor: f.color || '#5a7a52', focusTitle: f.title })));

  if (habits.length === 0) return null;

  return (
    <div className="habit-tracker">
      <div className="habit-tracker-body">
        {/* Header row: "Habits" title + day columns — clickable to collapse */}
        <div className="habit-row habit-header-row habit-header-clickable" onClick={() => setOpen(o => !o)}>
          <div className="habit-name-cell habit-title-cell">
            <span className="habit-tracker-title">Habits</span>
            <span className="icon-btn">{open ? '▼' : '▲'}</span>
          </div>
          {weekDates.map((dateStr, i) => {
            const dayNum = parseInt(dateStr.slice(8), 10);
            const isToday = dateStr === today;
            const isSelected = dateStr === selectedDate;
            return (
              <div key={dateStr} className={`habit-day-col ${isToday ? 'habit-day-today' : ''} ${isSelected && !isToday ? 'habit-day-selected' : ''}`}>
                <span className="habit-day-label">{DAY_SHORT[WEEK_DAYS[i]]}</span>
                <span className="habit-day-num">{dayNum}</span>
              </div>
            );
          })}
        </div>

        {/* Habit rows */}
        {open && habits.map(habit => {
          const scheduled = habit.days?.length > 0 ? habit.days : null; // null = every day
          return (
            <div key={habit.id} className="habit-row">
              <div className="habit-name-cell">
                <span className="habit-focus-dot" style={{ background: habit.focusColor }} />
                <span className="habit-name" title={`${habit.focusTitle}: ${habit.title}`}>
                  {habit.title}
                </span>
              </div>
              {weekDates.map((dateStr, i) => {
                const dayName = WEEK_DAYS[i];
                const isScheduled = !scheduled || scheduled.includes(dayName);
                const isDone = (habitLogs?.[dateStr] || []).includes(habit.id);
                const isToday = dateStr === today;

                if (!isScheduled) {
                  return <div key={dateStr} className="habit-cell habit-cell-off">—</div>;
                }

                return (
                  <div
                    key={dateStr}
                    className={`habit-cell habit-cell-on ${isDone ? 'done' : ''} ${isToday ? 'today' : ''}`}
                    onClick={e => { e.stopPropagation(); onToggle(habit.id, dateStr); }}
                    title={isDone ? 'Mark incomplete' : 'Mark complete'}
                  >
                    {isDone ? '●' : '○'}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

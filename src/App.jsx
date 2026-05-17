import { useState } from 'react';
import { useStore } from './store';
import { Matrix } from './components/Matrix';
import { DailyPlanner } from './components/DailyPlanner';
import { Focuses } from './components/Focuses';
import './App.css';

export default function App() {
  const [view, setView] = useState(() => localStorage.getItem('day-planner-view') || 'matrix');

  function switchView(v) {
    setView(v);
    localStorage.setItem('day-planner-view', v);
  }
  const store = useStore();

  return (
    <div className="app">
      <header className="app-header">
        <span className="app-logo">Day Planner</span>
        <nav className="app-nav">
          <button
            className={`nav-btn ${view === 'matrix' ? 'active' : ''}`}
            onClick={() => switchView('matrix')}
          >
            Eisenhower Matrix
          </button>
          <button
            className={`nav-btn ${view === 'planner' ? 'active' : ''}`}
            onClick={() => switchView('planner')}
          >
            Daily Planner
          </button>
          <button
            className={`nav-btn ${view === 'focuses' ? 'active' : ''}`}
            onClick={() => switchView('focuses')}
          >
            Quarterly Focuses
          </button>
        </nav>
      </header>

      <main className="app-main">
        {view === 'matrix' ? (
          <Matrix
            tasks={store.tasks}
            onUpdate={store.updateTask}
            onDelete={store.deleteTask}
            onAddTask={store.addTask}
            onAddToQueue={store.addToQueue}
            onUnschedule={store.unscheduleTask}
            focuses={store.focuses}
            reorderTasks={store.reorderTasks}
            moveTask={store.moveTask}
            inbox={store.inbox}
            onAddToInbox={store.addToInbox}
            onDeleteFromInbox={store.deleteFromInbox}
            onMoveFromInboxToQuadrant={store.moveFromInboxToQuadrant}
            onReorderInbox={store.reorderInbox}
          />
        ) : view === 'focuses' ? (
          <Focuses
            focuses={store.focuses}
            addFocus={store.addFocus}
            updateFocus={store.updateFocus}
            deleteFocus={store.deleteFocus}
            addHabitToFocus={store.addHabitToFocus}
            removeHabitFromFocus={store.removeHabitFromFocus}
            updateHabitDays={store.updateHabitDays}
            tasks={store.tasks}
            addSetupTaskToFocus={store.addSetupTaskToFocus}
            removeSetupTaskFromFocus={store.removeSetupTaskFromFocus}
            focusIdeas={store.focusIdeas}
            addFocusIdea={store.addFocusIdea}
            updateFocusIdea={store.updateFocusIdea}
            deleteFocusIdea={store.deleteFocusIdea}
            promoteFocusIdea={store.promoteFocusIdea}
          />
        ) : (
          <DailyPlanner
            blocksForDate={store.blocksForDate}
            addBlock={store.addBlock}
            updateBlock={store.updateBlock}
            deleteBlock={store.deleteBlock}
            tasks={store.tasks}
            getTasksForDate={store.getTasksForDate}
            scheduleTask={store.scheduleTask}
            unscheduleTask={store.unscheduleTask}
            reorderDayOrder={store.reorderDayOrder}
            onUpdateTask={store.updateTask}
            focuses={store.focuses}
            habitLogs={store.habitLogs}
            onToggleHabit={store.toggleHabitLog}
          />
        )}
      </main>
    </div>
  );
}

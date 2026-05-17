# Day Planner

A personal productivity app combining an Eisenhower Matrix, daily planner, and quarterly focus tracking. All data is stored locally in the browser — no account or backend required.

## Features

### Eisenhower Matrix
- Four quadrants: Urgent & Important, Important (Not Urgent), Urgent (Not Important), Not Urgent/Important
- **Inbox** for brain-dumping tasks before categorising — drag chips to a quadrant or use keyboard shortcuts (click a chip, then press `1`–`4`)
- Add tasks directly to a quadrant via the header buttons
- Drag to reorder tasks within and across quadrants
- "Not important" quadrants collapsed by default to keep focus on what matters
- Done tasks stay visible for the rest of the day, then disappear

### Daily Planner
- Calendar grid (6am–11pm) — click and drag to draw time blocks, drag to move or resize
- **Today's Tasks** list — pull in tasks from the matrix, drag to reorder
- Incomplete tasks from previous days roll over to today automatically
- Tasks scheduled for a future date show a date badge in the matrix and are hidden from the pull panel
- Habit tracker for recurring habits tied to quarterly focuses

### Quarterly Focuses
- Up to 4 focus themes per quarter with an if/then hypothesis structure
- Each focus has recurring habits (with per-day scheduling) and one-off setup tasks
- Setup tasks are automatically sent to the inbox when added
- Completion status of setup tasks syncs with the matrix/daily planner
- Ideas bank for future focus themes

## Stack

- [React](https://react.dev/) + [Vite](https://vite.dev/)
- [@dnd-kit](https://dndkit.com/) for drag and drop
- `localStorage` for persistence — no backend

## Running locally

```bash
npm install
npm run dev
```

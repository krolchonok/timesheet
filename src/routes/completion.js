const express = require('express');
const {
  db,
  parseWeekStart,
  ensureProjectTasksForWeek,
  rowsProjectHours,
  rowsAdminHours,
  rowsNormHours,
  hoursProgress,
  taskHasContent,
} = require('../db');
const { adminRequired } = require('../auth');

const router = express.Router();

router.get('/completion', adminRequired, (req, res) => {
  const week = parseWeekStart(req.query.week);
  const user = req.user;
  ensureProjectTasksForWeek(week, user.id);

  const people = db
    .prepare('SELECT id, name FROM people WHERE active = 1 ORDER BY name COLLATE NOCASE')
    .all();

  const result = [];
  let filledCount = 0;

  const tasksStmt = db.prepare('SELECT * FROM tasks WHERE week_start = ? AND fio = ?');
  const editorsStmt = db.prepare(
    `SELECT DISTINCT users.username
     FROM tasks
     JOIN users ON users.id = tasks.user_id
     WHERE tasks.week_start = ? AND tasks.fio = ? AND tasks.is_project = 0
     ORDER BY users.username`
  );

  for (const person of people) {
    const tasks = tasksStmt.all(week, person.name);
    const meaningful = tasks.filter((task) => !task.is_project && taskHasContent(task));
    const projectHours = rowsProjectHours(tasks);
    const adminHours = rowsAdminHours(tasks);
    const totalHours = rowsNormHours(tasks);
    const progress = hoursProgress(totalHours);
    const filled = progress.hours_complete;
    if (filled) filledCount += 1;
    const editors = editorsStmt.all(week, person.name);

    result.push({
      id: person.id,
      name: person.name,
      filled,
      task_count: meaningful.length,
      filled_tasks: meaningful.length,
      project_hours: projectHours,
      admin_hours: adminHours,
      total_hours: totalHours,
      hours_norm: progress.hours_norm,
      hours_percent: progress.hours_percent,
      hours_complete: progress.hours_complete,
      editors: editors.map((row) => row.username),
    });
  }

  res.json({
    week_start: week,
    total: result.length,
    filled_count: filledCount,
    missing_count: result.length - filledCount,
    people: result,
  });
});

module.exports = router;

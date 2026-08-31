const express = require('express');
const {
  db,
  DEFAULT_TASK_STATUS,
  utcNow,
  weekStartFor,
  parseWeekStart,
  getActivePerson,
  ensureProjectTasks,
  ensureProjectTasksForWeek,
  hoursProgress,
  progressWithBreakdown,
  taskRowToDict,
  normalizeTaskStatus,
  getTask,
  canAccessTask,
} = require('../db');
const { parseTaskPayload } = require('../helpers');
const { loginRequired } = require('../auth');

const router = express.Router();

const LIST_ORDER = 'ORDER BY tasks.is_project DESC, tasks.task COLLATE NOCASE, tasks.updated_at DESC, tasks.id DESC';

router.get('/tasks', loginRequired, (req, res) => {
  const user = req.user;
  const week = parseWeekStart(req.query.week);
  let fio = String(req.query.fio ?? '').trim();

  let rows;
  if (user.role === 'admin') {
    ensureProjectTasksForWeek(week, user.id, fio || null);
    let query = `
      SELECT tasks.*, users.username AS owner_username
      FROM tasks
      JOIN users ON users.id = tasks.user_id
      WHERE tasks.week_start = ?
    `;
    const params = [week];
    if (fio) {
      query += ' AND tasks.fio = ?';
      params.push(fio);
    }
    query += ` ${LIST_ORDER}`;
    rows = db.prepare(query).all(...params);
  } else {
    if (!fio) {
      return res.json({ tasks: [], progress: hoursProgress(0) });
    }
    const person = getActivePerson(fio);
    if (!person) {
      return res.json({ tasks: [], progress: hoursProgress(0) });
    }
    fio = person.name;
    ensureProjectTasks(fio, week, user.id);
    rows = db
      .prepare(
        `SELECT tasks.*, users.username AS owner_username
         FROM tasks
         JOIN users ON users.id = tasks.user_id
         WHERE tasks.week_start = ? AND tasks.fio = ?
         ${LIST_ORDER}`
      )
      .all(week, fio);
  }

  const tasks = rows.map(taskRowToDict);
  res.json({ tasks, progress: progressWithBreakdown(tasks) });
});

router.get('/weeks', loginRequired, (req, res) => {
  const user = req.user;
  const rows =
    user.role === 'admin'
      ? db
          .prepare(
            `SELECT week_start, COUNT(*) AS task_count
             FROM tasks
             GROUP BY week_start
             ORDER BY week_start DESC`
          )
          .all()
      : db
          .prepare(
            `SELECT week_start, COUNT(*) AS task_count
             FROM tasks
             WHERE user_id = ?
             GROUP BY week_start
             ORDER BY week_start DESC`
          )
          .all(user.id);
  res.json(rows.map((row) => ({ week_start: row.week_start, task_count: row.task_count })));
});

router.post('/tasks', loginRequired, (req, res) => {
  const user = req.user;
  const body = req.body || {};
  const payload = parseTaskPayload(body);
  payload.week_start = parseWeekStart(req.query.week || body.week_start);
  const now = utcNow();

  let targetUserId = user.id;
  if (user.role === 'admin' && req.query.user_id) {
    targetUserId = parseInt(req.query.user_id, 10);
  }

  if (payload.fio === '' && user.default_fio) {
    payload.fio = user.default_fio;
  }

  if (user.role !== 'admin') {
    const person = getActivePerson(payload.fio);
    if (!person) {
      return res.status(400).json({ error: 'Выберите ФИО из списка' });
    }
    payload.fio = person.name;
  }

  const info = db
    .prepare(
      `INSERT INTO tasks (
          user_id, week_start, fio, task, is_project, category, final_task, status,
          mon, tue, wed, thu, fri, comment, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 0, ?, '', ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      targetUserId,
      payload.week_start,
      payload.fio,
      payload.task,
      payload.category,
      DEFAULT_TASK_STATUS,
      payload.mon,
      payload.tue,
      payload.wed,
      payload.thu,
      payload.fri,
      payload.comment,
      now,
      now
    );

  const row = getTask(info.lastInsertRowid);
  res.status(201).json(taskRowToDict(row));
});

router.put('/tasks/:id', loginRequired, (req, res) => {
  const user = req.user;
  const taskId = parseInt(req.params.id, 10);
  const row = getTask(taskId);
  if (!row) return res.status(404).json({ error: 'Not found' });
  if (!canAccessTask(user, row)) return res.status(403).json({ error: 'Forbidden' });

  const body = req.body || {};
  const isAdmin = user.role === 'admin';
  const parsed = parseTaskPayload(body, { admin: isAdmin });
  const now = utcNow();

  let weekStart = body.week_start ? parsed.week_start : row.week_start;
  let fio = body.fio ? parsed.fio : row.fio;
  if (!('category' in body)) parsed.category = String(row.category || '');
  if (!('task' in body)) parsed.task = String(row.task || '');
  if (!('comment' in body)) parsed.comment = String(row.comment || '');
  let finalTask =
    isAdmin && 'final_task' in body ? parsed.final_task : String(row.final_task || '');
  let status = isAdmin && 'status' in body ? parsed.status : normalizeTaskStatus(row.status);

  if (row.is_project) {
    parsed.task = row.task;
    parsed.category = '';
    parsed.comment = String(row.comment || '');
    finalTask = '';
    status = DEFAULT_TASK_STATUS;
  } else if (!isAdmin) {
    const person = getActivePerson(fio);
    if (!person) return res.status(400).json({ error: 'Выберите ФИО из списка' });
    fio = person.name;
    if (status !== 'transferred') {
      const taskChanged = parsed.task !== String(row.task || '');
      const categoryChanged = parsed.category !== String(row.category || '');
      if (taskChanged || categoryChanged) status = 'editing';
    }
  }

  db.prepare(
    `UPDATE tasks
     SET fio = ?, task = ?, category = ?, final_task = ?, status = ?,
         mon = ?, tue = ?, wed = ?, thu = ?, fri = ?, comment = ?, week_start = ?, updated_at = ?
     WHERE id = ?`
  ).run(
    fio,
    parsed.task,
    parsed.category,
    finalTask,
    status,
    parsed.mon,
    parsed.tue,
    parsed.wed,
    parsed.thu,
    parsed.fri,
    parsed.comment,
    weekStart,
    now,
    taskId
  );

  res.json(taskRowToDict(getTask(taskId)));
});

router.delete('/tasks/:id', loginRequired, (req, res) => {
  const user = req.user;
  const taskId = parseInt(req.params.id, 10);
  const row = getTask(taskId);
  if (!row) return res.status(404).json({ error: 'Not found' });
  if (!canAccessTask(user, row)) return res.status(403).json({ error: 'Forbidden' });
  if (row.is_project && user.role !== 'admin') {
    return res.status(403).json({ error: 'Проектные задачи нельзя удалять' });
  }

  db.prepare('DELETE FROM tasks WHERE id = ?').run(taskId);
  res.json({ ok: true });
});

router.post('/tasks/:id/copy', loginRequired, (req, res) => {
  const user = req.user;
  const taskId = parseInt(req.params.id, 10);
  const row = getTask(taskId);
  if (!row) return res.status(404).json({ error: 'Not found' });
  if (!canAccessTask(user, row)) return res.status(403).json({ error: 'Forbidden' });

  const payload = req.body || {};
  let targetUserId = row.user_id;
  if (user.role === 'admin' && payload.user_id) {
    targetUserId = parseInt(payload.user_id, 10);
  } else if (user.role !== 'admin') {
    targetUserId = user.id;
  }

  const weekStart = parseWeekStart(payload.week_start || row.week_start);
  const now = utcNow();

  const info = db
    .prepare(
      `INSERT INTO tasks (
          user_id, week_start, fio, task, is_project, category, final_task, status,
          mon, tue, wed, thu, fri, comment, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, '', ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      targetUserId,
      weekStart,
      row.fio,
      row.task,
      row.is_project,
      row.category,
      DEFAULT_TASK_STATUS,
      row.mon,
      row.tue,
      row.wed,
      row.thu,
      row.fri,
      row.comment,
      now,
      now
    );

  res.status(201).json(taskRowToDict(getTask(info.lastInsertRowid)));
});

router.post('/tasks/:id/transfer', require('../auth').adminRequired, (req, res) => {
  const taskId = parseInt(req.params.id, 10);
  const row = getTask(taskId);
  if (!row) return res.status(404).json({ error: 'Not found' });
  if (row.is_project) {
    return res
      .status(400)
      .json({ error: 'Проектные задачи — только индикатор, перенос недоступен' });
  }

  const now = utcNow();
  const finalTask = String(row.task || '').trim();
  db.prepare(
    `UPDATE tasks
     SET final_task = ?, status = 'transferred', updated_at = ?
     WHERE id = ?`
  ).run(finalTask, now, taskId);

  res.json(taskRowToDict(getTask(taskId)));
});

module.exports = router;

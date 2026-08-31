const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');

const BASE_DIR = path.resolve(__dirname, '..');
const DB_PATH = path.join(BASE_DIR, 'data', 'timesheet.db');

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri'];
const WEEKLY_HOURS_NORM = 40;
const TASK_STATUSES = ['new', 'editing', 'transferred'];
const DEFAULT_TASK_STATUS = 'new';
const DEV_SECRET_KEY = 'timesheet-dev-secret-change-me';
const ADMIN_TASK_CATEGORY = 'Административные задачи';

function isProduction() {
  return String(process.env.TIMESHEET_ENV || 'development').toLowerCase() === 'production';
}

function seedDemoEnabled() {
  const fallback = isProduction() ? '0' : '1';
  return String(process.env.TIMESHEET_SEED_DEMO ?? fallback).trim() === '1';
}

function utcNow() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, '+00:00');
}

function mondayOf(date) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const weekday = (d.getUTCDay() + 6) % 7; // Monday=0 .. Sunday=6
  d.setUTCDate(d.getUTCDate() - weekday);
  return d;
}

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

function weekStartFor(day) {
  const base = day instanceof Date && !Number.isNaN(day.getTime()) ? day : new Date();
  return isoDate(mondayOf(base));
}

function parseWeekStart(value) {
  if (!value) return weekStartFor();
  const raw = String(value).trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return weekStartFor();
  const parsed = new Date(`${raw}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return weekStartFor();
  return weekStartFor(parsed);
}

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function tableColumns(table) {
  return new Set(db.prepare(`PRAGMA table_info(${table})`).all().map((row) => row.name));
}

function tableExists(name) {
  return (
    db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = ?")
      .get(name) !== undefined
  );
}

function migrateDb() {
  let columns = tableColumns('tasks');
  if (!columns.has('week_start')) {
    db.exec("ALTER TABLE tasks ADD COLUMN week_start TEXT NOT NULL DEFAULT ''");
    db.prepare("UPDATE tasks SET week_start = ? WHERE week_start = ''").run(weekStartFor());
  }

  if (!tableExists('people')) {
    db.exec(`
      CREATE TABLE people (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        active INTEGER NOT NULL DEFAULT 1
      );
    `);
  }

  if (!tableExists('project_task_templates')) {
    db.exec(`
      CREATE TABLE project_task_templates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0,
        active INTEGER NOT NULL DEFAULT 1
      );
    `);
  }

  columns = tableColumns('tasks');
  if (!columns.has('is_project')) {
    db.exec('ALTER TABLE tasks ADD COLUMN is_project INTEGER NOT NULL DEFAULT 0');
  }

  if (!tableExists('task_categories')) {
    db.exec(`
      CREATE TABLE task_categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0,
        active INTEGER NOT NULL DEFAULT 1
      );
    `);
  }

  columns = tableColumns('tasks');
  if (!columns.has('category')) {
    db.exec("ALTER TABLE tasks ADD COLUMN category TEXT NOT NULL DEFAULT ''");
  }
  if (!columns.has('final_task')) {
    db.exec("ALTER TABLE tasks ADD COLUMN final_task TEXT NOT NULL DEFAULT ''");
  }
  if (!columns.has('status')) {
    db.exec(`ALTER TABLE tasks ADD COLUMN status TEXT NOT NULL DEFAULT '${DEFAULT_TASK_STATUS}'`);
  }
}

function seedTaskCategories() {
  const defaults = ['Автоматизация процессов', 'Административные задачи', 'Макетирование'];
  const exists = db.prepare('SELECT id FROM task_categories WHERE name = ?');
  const insert = db.prepare('INSERT INTO task_categories (name, sort_order) VALUES (?, ?)');
  defaults.forEach((name, index) => {
    if (!exists.get(name)) insert.run(name, index);
  });
}

function seedProjectTemplates() {
  const defaults = ['Проектные задачи'];
  const exists = db.prepare('SELECT id FROM project_task_templates WHERE name = ?');
  const insert = db.prepare('INSERT INTO project_task_templates (name) VALUES (?)');
  defaults.forEach((name) => {
    if (!exists.get(name)) insert.run(name);
  });

  db.prepare('UPDATE project_task_templates SET active = 0 WHERE name = ?').run(ADMIN_TASK_CATEGORY);
  db.prepare(
    `UPDATE tasks SET is_project = 0, category = ?
     WHERE is_project = 1 AND task = ?`
  ).run(ADMIN_TASK_CATEGORY, ADMIN_TASK_CATEGORY);
}

function seedPeople() {
  const demo = ['Иванов И.И.', 'Петров П.П.', 'Сидорова А.А.', 'Козлов Д.В.'];
  const exists = db.prepare('SELECT id FROM people WHERE name = ?');
  const insert = db.prepare('INSERT INTO people (name) VALUES (?)');
  demo.forEach((name) => {
    if (!exists.get(name)) insert.run(name);
  });
}

function syncOrphanTaskFio() {
  const peopleNames = db
    .prepare('SELECT name FROM people WHERE active = 1')
    .all()
    .map((row) => row.name);
  if (peopleNames.length === 0) return;

  const tasks = db.prepare('SELECT id, fio FROM tasks').all();
  const update = db.prepare('UPDATE tasks SET fio = ? WHERE id = ?');
  for (const task of tasks) {
    const fio = String(task.fio || '').trim();
    if (!fio || peopleNames.includes(fio)) continue;

    const match = peopleNames.find(
      (name) => name.startsWith(fio) || fio.startsWith(name.split(' ')[0])
    );
    if (match) update.run(match, task.id);
  }
}

function getActivePerson(name) {
  if (!name) return null;
  return db.prepare('SELECT * FROM people WHERE name = ? AND active = 1').get(String(name).trim());
}

function ensureProjectTasks(fio, weekStart, userId) {
  const templates = db
    .prepare(
      `SELECT name FROM project_task_templates
       WHERE active = 1
       ORDER BY sort_order, name COLLATE NOCASE`
    )
    .all();
  if (templates.length === 0) return;

  const now = utcNow();
  const exists = db.prepare(
    `SELECT id FROM tasks
     WHERE fio = ? AND week_start = ? AND is_project = 1 AND task = ?`
  );
  const insert = db.prepare(
    `INSERT INTO tasks (
        user_id, week_start, fio, task, is_project, category, final_task, status,
        mon, tue, wed, thu, fri, comment, created_at, updated_at
    ) VALUES (?, ?, ?, ?, 1, '', '', ?, 0, 0, 0, 0, 0, '', ?, ?)`
  );

  for (const template of templates) {
    if (exists.get(fio, weekStart, template.name)) continue;
    insert.run(userId, weekStart, fio, template.name, DEFAULT_TASK_STATUS, now, now);
  }
}

function ensureProjectTasksForWeek(weekStart, userId, fio) {
  const names = fio
    ? [fio]
    : db
        .prepare('SELECT name FROM people WHERE active = 1 ORDER BY name COLLATE NOCASE')
        .all()
        .map((row) => row.name);
  for (const name of names) {
    ensureProjectTasks(name, weekStart, userId);
  }
}

function hoursProgress(totalHours) {
  const norm = WEEKLY_HOURS_NORM;
  const percent = norm ? Math.min(100, Math.round((totalHours / norm) * 100)) : 0;
  return {
    total_hours: totalHours,
    hours_norm: norm,
    hours_percent: percent,
    hours_complete: totalHours >= norm,
  };
}

function rowsProjectHours(rows) {
  return rows
    .filter((row) => row.is_project)
    .reduce((sum, row) => sum + DAYS.reduce((s, day) => s + Number(row[day] || 0), 0), 0);
}

function rowsAdminHours(rows) {
  return rows
    .filter((row) => !row.is_project && String(row.category || '') === ADMIN_TASK_CATEGORY)
    .reduce((sum, row) => sum + DAYS.reduce((s, day) => s + Number(row[day] || 0), 0), 0);
}

function rowsNormHours(rows) {
  return rowsProjectHours(rows) + rowsAdminHours(rows);
}

function taskHasContent(row) {
  if (String(row.task || '').trim()) return true;
  return DAYS.reduce((s, day) => s + Number(row[day] || 0), 0) > 0;
}

function projectHoursTotal(tasks) {
  return tasks
    .filter((t) => t.is_project)
    .reduce((sum, t) => sum + Number(t.total || 0), 0);
}

function adminHoursTotal(tasks) {
  return tasks
    .filter((t) => !t.is_project && String(t.category || '') === ADMIN_TASK_CATEGORY)
    .reduce((sum, t) => sum + Number(t.total || 0), 0);
}

function progressWithBreakdown(tasks) {
  const projectHours = projectHoursTotal(tasks);
  const adminHours = adminHoursTotal(tasks);
  const totalHours = projectHours + adminHours;
  const progress = hoursProgress(totalHours);
  progress.project_hours = projectHours;
  progress.admin_hours = adminHours;
  return progress;
}

function taskRowToDict(row) {
  const data = { ...row };
  data.total = DAYS.reduce((sum, day) => sum + Number(data[day] || 0), 0);
  return data;
}

function normalizeTaskStatus(value) {
  const status = String(value || DEFAULT_TASK_STATUS).trim().toLowerCase();
  return TASK_STATUSES.includes(status) ? status : DEFAULT_TASK_STATUS;
}

function getTask(taskId) {
  return db
    .prepare(
      `SELECT tasks.*, users.username AS owner_username
       FROM tasks
       JOIN users ON users.id = tasks.user_id
       WHERE tasks.id = ?`
    )
    .get(taskId);
}

function canAccessTask(user, taskRow) {
  return user.role === 'admin' || taskRow.user_id === user.id;
}

function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'user',
        default_fio TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        fio TEXT NOT NULL DEFAULT '',
        task TEXT NOT NULL DEFAULT '',
        mon REAL NOT NULL DEFAULT 0,
        tue REAL NOT NULL DEFAULT 0,
        wed REAL NOT NULL DEFAULT 0,
        thu REAL NOT NULL DEFAULT 0,
        fri REAL NOT NULL DEFAULT 0,
        comment TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS people (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        active INTEGER NOT NULL DEFAULT 1
    );
  `);
}

function provisionAdmin() {
  const adminExists = db.prepare("SELECT id FROM users WHERE username = 'admin'").get();

  if (seedDemoEnabled()) {
    if (!adminExists) {
      db.prepare(
        'INSERT INTO users (username, password_hash, role, default_fio) VALUES (?, ?, ?, ?)'
      ).run('admin', bcrypt.hashSync('admin', 10), 'admin', 'Администратор');
    }
    const userExists = db.prepare("SELECT id FROM users WHERE username = 'user'").get();
    if (!userExists) {
      db.prepare(
        'INSERT INTO users (username, password_hash, role, default_fio) VALUES (?, ?, ?, ?)'
      ).run('user', bcrypt.hashSync('user', 10), 'user', '');
    }
  } else if (!adminExists) {
    const adminUsername = String(process.env.ADMIN_USERNAME || 'admin').trim() || 'admin';
    const adminPassword = String(process.env.ADMIN_PASSWORD || '').trim();
    if (adminPassword) {
      db.prepare(
        'INSERT INTO users (username, password_hash, role, default_fio) VALUES (?, ?, ?, ?)'
      ).run(adminUsername, bcrypt.hashSync(adminPassword, 10), 'admin', 'Администратор');
    }
  }
}

function initDb() {
  initSchema();
  migrateDb();
  seedPeople();
  seedProjectTemplates();
  seedTaskCategories();
  syncOrphanTaskFio();
  provisionAdmin();
}

initDb();

module.exports = {
  db,
  DAYS,
  WEEKLY_HOURS_NORM,
  TASK_STATUSES,
  DEFAULT_TASK_STATUS,
  DEV_SECRET_KEY,
  ADMIN_TASK_CATEGORY,
  isProduction,
  seedDemoEnabled,
  utcNow,
  weekStartFor,
  parseWeekStart,
  getActivePerson,
  ensureProjectTasks,
  ensureProjectTasksForWeek,
  hoursProgress,
  rowsProjectHours,
  rowsAdminHours,
  rowsNormHours,
  taskHasContent,
  progressWithBreakdown,
  taskRowToDict,
  normalizeTaskStatus,
  getTask,
  canAccessTask,
};

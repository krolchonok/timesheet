const express = require('express');
const { db } = require('../db');
const { loginRequired, adminRequired } = require('../auth');

const router = express.Router();

router.get('/project-templates', loginRequired, (req, res) => {
  const rows = db
    .prepare(
      `SELECT id, name, sort_order
       FROM project_task_templates
       WHERE active = 1
       ORDER BY sort_order, name COLLATE NOCASE`
    )
    .all();
  res.json(rows);
});

router.post('/project-templates', adminRequired, (req, res) => {
  const body = req.body || {};
  const name = String(body.name ?? '').trim();
  if (!name) return res.status(400).json({ error: 'Укажите название' });

  const existing = db.prepare('SELECT id FROM project_task_templates WHERE name = ?').get(name);
  if (existing) {
    db.prepare('UPDATE project_task_templates SET active = 1 WHERE id = ?').run(existing.id);
    const row = db
      .prepare('SELECT id, name, sort_order FROM project_task_templates WHERE id = ?')
      .get(existing.id);
    return res.json(row);
  }

  const info = db.prepare('INSERT INTO project_task_templates (name) VALUES (?)').run(name);
  const row = db
    .prepare('SELECT id, name, sort_order FROM project_task_templates WHERE id = ?')
    .get(info.lastInsertRowid);
  res.status(201).json(row);
});

router.delete('/project-templates/:id', adminRequired, (req, res) => {
  const templateId = parseInt(req.params.id, 10);
  const row = db.prepare('SELECT id FROM project_task_templates WHERE id = ?').get(templateId);
  if (!row) return res.status(404).json({ error: 'Not found' });
  db.prepare('UPDATE project_task_templates SET active = 0 WHERE id = ?').run(templateId);
  res.json({ ok: true });
});

module.exports = router;

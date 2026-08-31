const express = require('express');
const { db } = require('../db');
const { adminRequired } = require('../auth');

const router = express.Router();

router.get('/categories', (req, res) => {
  const rows = db
    .prepare(
      `SELECT id, name, sort_order
       FROM task_categories
       WHERE active = 1
       ORDER BY sort_order, name COLLATE NOCASE`
    )
    .all();
  res.json(rows);
});

router.post('/categories', adminRequired, (req, res) => {
  const body = req.body || {};
  const name = String(body.name ?? '').trim();
  if (!name) return res.status(400).json({ error: 'Укажите название категории' });

  const existing = db.prepare('SELECT id FROM task_categories WHERE name = ?').get(name);
  if (existing) {
    db.prepare('UPDATE task_categories SET active = 1 WHERE id = ?').run(existing.id);
    const row = db
      .prepare('SELECT id, name, sort_order FROM task_categories WHERE id = ?')
      .get(existing.id);
    return res.json(row);
  }

  const maxOrder = db
    .prepare('SELECT COALESCE(MAX(sort_order), -1) AS max_order FROM task_categories')
    .get().max_order;
  const info = db
    .prepare('INSERT INTO task_categories (name, sort_order) VALUES (?, ?)')
    .run(name, maxOrder + 1);
  const row = db
    .prepare('SELECT id, name, sort_order FROM task_categories WHERE id = ?')
    .get(info.lastInsertRowid);
  res.status(201).json(row);
});

router.delete('/categories/:id', adminRequired, (req, res) => {
  const categoryId = parseInt(req.params.id, 10);
  const row = db.prepare('SELECT id FROM task_categories WHERE id = ?').get(categoryId);
  if (!row) return res.status(404).json({ error: 'Not found' });
  db.prepare('UPDATE task_categories SET active = 0 WHERE id = ?').run(categoryId);
  res.json({ ok: true });
});

module.exports = router;

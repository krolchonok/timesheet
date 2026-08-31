const express = require('express');
const { db } = require('../db');
const { adminRequired } = require('../auth');

const router = express.Router();

router.get('/people', (req, res) => {
  const rows = db
    .prepare('SELECT id, name FROM people WHERE active = 1 ORDER BY name COLLATE NOCASE')
    .all();
  res.json(rows);
});

router.post('/people', adminRequired, (req, res) => {
  const body = req.body || {};
  const name = String(body.name ?? '').trim();
  if (!name) return res.status(400).json({ error: 'Укажите ФИО' });

  const existing = db.prepare('SELECT id FROM people WHERE name = ?').get(name);
  if (existing) {
    db.prepare('UPDATE people SET active = 1 WHERE id = ?').run(existing.id);
    const row = db.prepare('SELECT id, name FROM people WHERE id = ?').get(existing.id);
    return res.json(row);
  }

  const info = db.prepare('INSERT INTO people (name) VALUES (?)').run(name);
  const row = db.prepare('SELECT id, name FROM people WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json(row);
});

router.delete('/people/:id', adminRequired, (req, res) => {
  const personId = parseInt(req.params.id, 10);
  const row = db.prepare('SELECT id FROM people WHERE id = ?').get(personId);
  if (!row) return res.status(404).json({ error: 'Not found' });
  db.prepare('UPDATE people SET active = 0 WHERE id = ?').run(personId);
  res.json({ ok: true });
});

module.exports = router;

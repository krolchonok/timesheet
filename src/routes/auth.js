const express = require('express');
const bcrypt = require('bcryptjs');
const { db } = require('../db');
const { loginRequired, currentUser } = require('../auth');

const router = express.Router();

function userPayload(user) {
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    default_fio: user.default_fio,
  };
}

router.post('/login', (req, res) => {
  const body = req.body || {};
  const username = String(body.username ?? '').trim();
  const password = String(body.password ?? '');

  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Неверный логин или пароль' });
  }

  req.session = { userId: user.id };
  res.json(userPayload(user));
});

router.post('/logout', (req, res) => {
  req.session = null;
  res.json({ ok: true });
});

router.get('/me', loginRequired, (req, res) => {
  res.json(userPayload(req.user));
});

router.put('/me', loginRequired, (req, res) => {
  const body = req.body || {};
  const defaultFio = String(body.default_fio ?? req.user.default_fio).trim();
  db.prepare('UPDATE users SET default_fio = ? WHERE id = ?').run(defaultFio, req.user.id);
  res.json({ default_fio: defaultFio });
});

module.exports = router;

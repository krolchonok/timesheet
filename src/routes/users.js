const express = require('express');
const { db } = require('../db');
const { adminRequired } = require('../auth');

const router = express.Router();

router.get('/users', adminRequired, (req, res) => {
  const rows = db
    .prepare('SELECT id, username, role, default_fio FROM users ORDER BY username')
    .all();
  res.json(rows);
});

module.exports = router;

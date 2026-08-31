#!/usr/bin/env node
require('dotenv').config();

const { parseArgs } = require('node:util');
const bcrypt = require('bcryptjs');
const { db } = require('../src/db');

function main() {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      role: { type: 'string', default: 'user' },
      fio: { type: 'string', default: '' },
    },
  });

  const [username, password] = positionals;
  if (!username || !password) {
    console.error('Usage: node scripts/create-user.js <username> <password> [--role user|admin] [--fio "ФИО"]');
    process.exitCode = 1;
    return;
  }
  if (!['user', 'admin'].includes(values.role)) {
    console.error('--role must be "user" or "admin"');
    process.exitCode = 1;
    return;
  }

  const passwordHash = bcrypt.hashSync(password, 10);
  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);

  let action;
  if (existing) {
    db.prepare('UPDATE users SET password_hash = ?, role = ?, default_fio = ? WHERE id = ?').run(
      passwordHash,
      values.role,
      values.fio,
      existing.id
    );
    action = 'updated';
  } else {
    db.prepare(
      'INSERT INTO users (username, password_hash, role, default_fio) VALUES (?, ?, ?, ?)'
    ).run(username, passwordHash, values.role, values.fio);
    action = 'created';
  }

  console.log(`User '${username}' ${action} (role=${values.role})`);
}

main();

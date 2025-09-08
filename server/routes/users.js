// server/routes/users.js
const express = require('express');
const router = express.Router();
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const dbPath = path.join(__dirname, '..', 'app.db');
const db = new sqlite3.Database(dbPath);

// Basic list endpoint for admin
router.get('/users', (req, res) => {
  let { q = '', limit = 100, offset = 0 } = req.query;
  limit = Math.max(1, Math.min(500, Number(limit) || 100));
  offset = Math.max(0, Number(offset) || 0);

  const where = [];
  const params = [];
  if (q) {
    where.push('(firstName LIKE ? OR lastName LIKE ? OR email LIKE ? OR stateCode LIKE ?)');
    params.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
  }
  const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const sql = `
    SELECT id, firstName, lastName, email, stateCode, createdAt
    FROM users
    ${whereSql}
    ORDER BY id DESC
    LIMIT ? OFFSET ?
  `;
  params.push(limit, offset);

  db.all(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ error: String(err) });
    const users = rows.map(r => ({
      id: r.id,
      firstName: r.firstName,
      lastName: r.lastName || '',
      email: r.email,
      stateCode: r.stateCode || '',
      createdAt: Number(r.createdAt || 0)
    }));
    res.json(users);
  });
});

module.exports = router;

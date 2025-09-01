const express = require('express');
const { findUser } = require('../config/users');
const { sign } = require('../middleware/auth');

const router = express.Router();

router.post('/login', async (req, res) => {
  const { username, password } = req.body || {};
  const user = findUser(username, password);
  if (!user) return res.status(401).json({ error: 'invalid_credentials' });
  const token = sign(user);
  res.json({ token, user: { id: user.id, username: user.username, role: user.role } });
});

module.exports = { router };

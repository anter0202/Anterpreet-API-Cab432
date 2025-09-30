/**
 * Hard-coded users for A1. Do NOT use in production.
 */
const USERS = [
  { id: '11111111-1111-1111-1111-111111111111', username: 'admin', password: 'adminpass', role: 'admin' },
  { id: '22222222-2222-2222-2222-222222222222', username: 'user',  password: 'userpass',  role: 'user'  }
];

function findUser(username, password) {
  return USERS.find(u => u.username === username && u.password === password) || null;
}

module.exports = { USERS, findUser };

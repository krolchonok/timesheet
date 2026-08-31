const cookieSession = require('cookie-session');
const { db, isProduction, DEV_SECRET_KEY } = require('./db');

function resolveSecretKey() {
  return process.env.SECRET_KEY || DEV_SECRET_KEY;
}

function assertProductionSecretKey() {
  if (!isProduction()) return;
  const secretKey = resolveSecretKey();
  if (!secretKey || secretKey === DEV_SECRET_KEY) {
    throw new Error('Set a strong SECRET_KEY when TIMESHEET_ENV=production');
  }
}

function sessionMiddleware() {
  const options = {
    name: 'session',
    keys: [resolveSecretKey()],
  };
  if (isProduction()) {
    options.httpOnly = true;
    options.sameSite = 'lax';
    options.secure = process.env.SESSION_COOKIE_SECURE !== '0';
  }
  return cookieSession(options);
}

function currentUser(req) {
  const userId = req.session && req.session.userId;
  if (!userId) return null;
  return db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
}

function optionalAuth(req, res, next) {
  req.user = currentUser(req);
  next();
}

function loginRequired(req, res, next) {
  const user = currentUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  req.user = user;
  next();
}

function adminRequired(req, res, next) {
  const user = currentUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  if (user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  req.user = user;
  next();
}

module.exports = {
  assertProductionSecretKey,
  sessionMiddleware,
  currentUser,
  optionalAuth,
  loginRequired,
  adminRequired,
};

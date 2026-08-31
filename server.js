require('dotenv').config();

const path = require('path');
const express = require('express');
const { assertProductionSecretKey, sessionMiddleware } = require('./src/auth');

assertProductionSecretKey();

const BASE_DIR = __dirname;
const FRONTEND_FILES = ['app.js', 'admin.js', 'login.js', 'week.js', 'api.js', 'styles.css'];

const app = express();

if (String(process.env.TRUST_PROXY || '1') !== '0') {
  app.set('trust proxy', 1);
}

app.use(express.json());
app.use(sessionMiddleware());

app.get('/', (req, res) => res.sendFile(path.join(BASE_DIR, 'index.html')));
app.get('/login', (req, res) => res.sendFile(path.join(BASE_DIR, 'login.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(BASE_DIR, 'admin.html')));

for (const file of FRONTEND_FILES) {
  app.get(`/${file}`, (req, res) => res.sendFile(path.join(BASE_DIR, file)));
}

app.use('/api', require('./src/routes/auth'));
app.use('/api', require('./src/routes/tasks'));
app.use('/api', require('./src/routes/people'));
app.use('/api', require('./src/routes/categories'));
app.use('/api', require('./src/routes/project-templates'));
app.use('/api', require('./src/routes/users'));
app.use('/api', require('./src/routes/completion'));

const HOST = process.env.HOST || '0.0.0.0';
const PORT = parseInt(process.env.PORT || '8888', 10);

app.listen(PORT, HOST);

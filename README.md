# Timesheet

Веб-таблица учёта задач и часов с экспортом в MS Project.

**Репозиторий:** https://github.com/krolchonok/timesheet

## Возможности

- Роли **user** (сотрудник) и **admin** (руководитель)
- Недельные табели, категории, статусы задач
- Норма **40 ч** = проектная строка + административные задачи
- Админ: контроль заполнения, итоговое наименование, управление справочниками
- Экспорт CSV

Подробнее для пользователей: [INSTRUCTION.md](INSTRUCTION.md)

## Быстрый старт (разработка)

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
./start.sh 8888
```

Открыть: http://127.0.0.1:8888/login

Демо-логины (только dev): `user` / `user`, `admin` / `admin`

## Production

### 1. Подготовка

```bash
git clone https://github.com/krolchonok/timesheet.git
cd timesheet
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
```

Отредактируйте `.env`:

- `SECRET_KEY` — длинная случайная строка (обязательно)
- `TIMESHEET_ENV=production`
- `TIMESHEET_SEED_DEMO=0` — без demo admin/user

### 2. Пользователи

```bash
python3 scripts/create_user.py admin 'your-secure-password' --role admin
python3 scripts/create_user.py ivanov 'password' --role user
```

Либо задайте `ADMIN_USERNAME` и `ADMIN_PASSWORD` в `.env` перед первым запуском.

### 3. Запуск

```bash
chmod +x start-prod.sh start.sh
./start-prod.sh
```

Gunicorn слушает `HOST:PORT` из `.env` (по умолчанию `0.0.0.0:8888`).

### 4. systemd (опционально)

```bash
sudo cp -r . /opt/timesheet
sudo cp deploy/timesheet.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now timesheet
```

За nginx/caddy — проксируйте на `127.0.0.1:8888`, включите HTTPS и `SESSION_COOKIE_SECURE=1`.

## Переменные окружения

| Переменная | Описание |
|------------|----------|
| `SECRET_KEY` | Ключ сессий Flask (обязателен в prod) |
| `TIMESHEET_ENV` | `development` или `production` |
| `TIMESHEET_SEED_DEMO` | `1` — demo user/admin при первом старте |
| `HOST`, `PORT` | Адрес и порт |
| `SESSION_COOKIE_SECURE` | `1` за HTTPS |
| `GUNICORN_WORKERS` | Число воркеров (по умолчанию 2) |

## Стек

Flask + SQLite + Gunicorn, статический фронтенд (HTML/JS/CSS).

База данных: `data/timesheet.db` (не в git).

## Структура

```
timesheet/
├── server.py          # API и бэкенд
├── start.sh           # dev-сервер
├── start-prod.sh      # gunicorn
├── scripts/create_user.py
├── INSTRUCTION.md     # инструкция для пользователей
└── deploy/timesheet.service
```

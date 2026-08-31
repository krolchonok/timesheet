# Timesheet

Веб-таблица учёта задач и часов с экспортом в MS Project.

**Репозиторий:** https://github.com/krolchonok/timesheet  
**Релизы:** https://github.com/krolchonok/timesheet/releases

Установка на другой сервер: [INSTALL.md](INSTALL.md)

## Возможности

- Роли **user** (сотрудник) и **admin** (руководитель)
- Недельные табели, категории, статусы задач
- Норма **40 ч** = проектная строка + административные задачи
- Админ: контроль заполнения, итоговое наименование, управление справочниками
- Экспорт CSV

Подробнее для пользователей: [INSTRUCTION.md](INSTRUCTION.md)

## Быстрый старт (разработка)

```bash
npm install
./start.sh 8888
```

Открыть: http://127.0.0.1:8888/login

Демо-логины (только dev): `user` / `user`, `admin` / `admin`

## Production

Расписание доступно **без входа**. Админ-панель — только после логина (`/login` → `/admin`).

### 1. Подготовка

```bash
git clone https://github.com/krolchonok/timesheet.git
cd timesheet
npm install
cp .env.example .env
```

Отредактируйте `.env`:

- `SECRET_KEY` — длинная случайная строка (обязательно)
- `TIMESHEET_ENV=production`
- `TIMESHEET_SEED_DEMO=0` — без demo admin/user

### 2. Пользователи

```bash
node scripts/create-user.js admin 'your-secure-password' --role admin
node scripts/create-user.js ivanov 'password' --role user
```

Либо задайте `ADMIN_USERNAME` и `ADMIN_PASSWORD` в `.env` перед первым запуском.

### 3. Запуск

```bash
chmod +x start-prod.sh start.sh
./start-prod.sh
```

Node слушает `HOST:PORT` из `.env` (по умолчанию `0.0.0.0:8888`).

### 4. systemd (опционально)

Автоматически (клонируйте репозиторий и запустите установщик — он сам поставит зависимости, сгенерирует `.env` с `SECRET_KEY`, спросит логин/пароль администратора и включит systemd-сервис):

```bash
sudo ./install.sh            # ставит в /opt/timesheet
sudo ./install.sh /srv/timesheet   # или в другую директорию
```

Вручную:

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
| `SECRET_KEY` | Ключ сессий (обязателен в prod) |
| `TIMESHEET_ENV` | `development` или `production` |
| `TIMESHEET_SEED_DEMO` | `1` — demo user/admin при первом старте |
| `HOST`, `PORT` | Адрес и порт |
| `SESSION_COOKIE_SECURE` | `1` за HTTPS |
| `TRUST_PROXY` | `1` (по умолчанию) за nginx; `0` без прокси |

## Стек

Express + better-sqlite3 (Node.js), статический фронтенд (HTML/JS/CSS).

База данных: `data/timesheet.db` (не в git).

## Структура

```
timesheet/
├── server.js          # точка входа (Express)
├── src/               # маршруты API, работа с БД, аутентификация
├── start.sh           # dev-сервер
├── start-prod.sh      # production-сервер
├── scripts/create-user.js
├── INSTRUCTION.md     # инструкция для пользователей
└── deploy/
    ├── timesheet.service
    └── nginx-timesheet.conf   # пример для nginx на другом ПК
```

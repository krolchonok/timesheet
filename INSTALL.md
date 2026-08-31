# Установка Timesheet на другом сервере

Краткая инструкция: app-сервер + nginx на отдельной машине (опционально).

## Требования

- Linux с **Node.js 18+** и **npm**
- **systemd** (для фонового запуска через `install.sh`)
- Доступ в интернет для `git clone` и `npm install`

## 1. App-сервер (где крутится Node)

```bash
git clone https://github.com/krolchonok/timesheet.git
cd timesheet
npm install
cp .env.example .env
```

Сгенерируйте `SECRET_KEY`:

```bash
openssl rand -hex 32
```

В `.env` обязательно:

```env
TIMESHEET_ENV=production
SECRET_KEY=<ваша-случайная-строка>
TIMESHEET_SEED_DEMO=0
HOST=0.0.0.0
PORT=8888
```

Создайте пользователей (или задайте `ADMIN_USERNAME` / `ADMIN_PASSWORD` в `.env` до первого старта):

```bash
node scripts/create-user.js admin 'secure-password' --role admin
node scripts/create-user.js ivanov 'password' --role user --fio "Иванов И.И."
```

### Запуск в фоне (systemd)

```bash
chmod +x install.sh start-prod.sh start.sh
sudo ./install.sh              # установка в /opt/timesheet
# или
sudo ./install.sh /srv/timesheet
```

Проверка:

```bash
sudo systemctl status timesheet
curl -I http://127.0.0.1:8888/login
```

Логи: `journalctl -u timesheet -f`

### Без systemd (вручную)

```bash
./start-prod.sh
# или в фоне:
nohup ./start-prod.sh >> data/timesheet.log 2>&1 &
```

## 2. Nginx на другом ПК (reverse proxy)

На nginx-машине отредактируйте [deploy/nginx-timesheet.conf](deploy/nginx-timesheet.conf):

- `192.168.1.10:8888` → IP и порт app-сервера
- `timesheet.example.com` → ваш домен

```bash
sudo cp deploy/nginx-timesheet.conf /etc/nginx/sites-available/timesheet
sudo ln -sf /etc/nginx/sites-available/timesheet /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

HTTPS:

```bash
sudo certbot --nginx -d timesheet.example.com
```

На app-сервере при HTTPS через nginx: `SESSION_COOKIE_SECURE=1` в `.env`.

Firewall на app-сервере: открыть порт `8888` **только** для IP nginx-хоста.

## 3. Обновление

```bash
cd /opt/timesheet   # или ваш INSTALL_DIR
sudo systemctl stop timesheet
git pull
npm install --omit=dev
sudo systemctl start timesheet
```

База `data/timesheet.db` при обновлении сохраняется.

## Скачать релиз с GitHub

```bash
git clone --branch v1.0.0 https://github.com/krolchonok/timesheet.git
# далее шаги из раздела 1
```

Или архив: https://github.com/krolchonok/timesheet/releases/latest

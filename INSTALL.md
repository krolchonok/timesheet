# Установка Timesheet на другом сервере

Краткая инструкция: app-сервер + nginx на отдельной машине (опционально).

## Требования

- Linux с **Python 3.10+**
- **systemd** (для фонового запуска через `install.sh`)
- Доступ в интернет для `git clone` и `pip install`

## 1. App-сервер

```bash
git clone https://github.com/krolchonok/timesheet.git
cd timesheet
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
```

В `.env`:

```env
TIMESHEET_ENV=production
SECRET_KEY=<openssl rand -hex 32>
TIMESHEET_SEED_DEMO=0
HOST=0.0.0.0
PORT=8888
```

Пользователи:

```bash
python3 scripts/create_user.py admin 'secure-password' --role admin
python3 scripts/create_user.py ivanov 'password' --role user
```

### Запуск в фоне (systemd)

```bash
chmod +x install.sh start-prod.sh start.sh
sudo ./install.sh
```

Проверка:

```bash
sudo systemctl status timesheet
curl -I http://127.0.0.1:8888/login
```

### Без systemd

```bash
./start-prod.sh
```

## 2. Nginx на другом ПК

См. [deploy/nginx-timesheet.conf](deploy/nginx-timesheet.conf).

## 3. Обновление

```bash
cd /opt/timesheet
sudo systemctl stop timesheet
git pull
.venv/bin/pip install -r requirements.txt
sudo systemctl start timesheet
```

## Скачать релиз

https://github.com/krolchonok/timesheet/releases/latest

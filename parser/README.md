# Парсер демок Dota 2 (СТАРТ+)

Небольшой сервис на [clarity](https://github.com/skadistats/clarity): принимает `.dem`,
возвращает JSON с итогами матча (герои, K/D/A, нетворс, предметы, урон, Steam ID).
Сайт отправляет ему демку при загрузке в админке → «Субботние 5v5» → «Загрузить демо».

## Установка на VPS (один раз)

```bash
sudo apt install -y openjdk-21-jdk-headless maven   # clarity 4 требует Java 21
cd /path/to/5-5/parser
mvn -q package                       # соберёт target/startplus-parser.jar
java -jar target/startplus-parser.jar /path/to/match.dem   # проверка на одной демке
```

Запуск как службы:

```bash
sudo cp ../deploy/parser/startplus-parser.service /etc/systemd/system/
# в файле поправьте WorkingDirectory/путь к jar и пользователя
sudo systemctl daemon-reload
sudo systemctl enable --now startplus-parser
curl http://127.0.0.1:5600/health    # {"ok":true}
```

В `.env` сайта добавьте:

```
PARSER_URL=http://127.0.0.1:5600
```

И поднимите лимит загрузки в nginx (демка весит 50–150 МБ):

```
client_max_body_size 300m;
proxy_request_buffering off;
proxy_read_timeout 300s;
```

## Если демка не разбирается

1. Проверьте вручную: `java -jar target/startplus-parser.jar match.dem`.
2. После крупных патчей Dota поднимите `clarity.version` в `pom.xml` и пересоберите.

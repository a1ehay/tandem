# Tandem API (Java / Spring Boot)

Backend разрабатывается на Java 25 LTS и Spring Boot 4.1.2. Он независим от frontend build и Cloudflare Worker. Миграции PostgreSQL принадлежат отдельному проекту `database/` и запускаются через Flyway.

## Требования

- Java 25 (LTS)
- Maven 3.6.3 или новее
- Локальный PostgreSQL из корневого `compose.yaml`

## Локальный запуск

Из корня репозитория один раз создайте `.env` по образцу, задайте пароль и запустите PostgreSQL с Flyway-схемой:

```sh
cp .env.example .env
docker compose up -d postgres
docker compose --profile migrate run --rm migrate
```

Затем из `backend/` загрузите переменные из корневого `.env` и запустите приложение:

```sh
set -a
. ../.env
set +a
mvn spring-boot:run
```

Сервер слушает `0.0.0.0:8080` по умолчанию. Параметры приложения можно задать через `HTTP_HOST`, `HTTP_PORT`, `DB_URL`, `DB_USER`, `DB_PASSWORD` и `DB_POOL_SIZE`; секреты не хранятся в исходниках. Backend не запускает DDL/Flyway автоматически: сначала применяются миграции отдельным `database/`-проектом.

## Начальные маршруты

- `GET /healthz` → `{"status":"ok"}` — простой health-check, не проверяет доступность БД.
- `GET /actuator/health` — Spring Boot Actuator health; включает проверку DataSource.
- `GET /actuator/info` — информация о приложении.

Actuator наружу публикует только health и info, подробности health-ответа скрыты.

## Структура исходников

- `src/main/java/com/tandem/api/` — Spring Boot-приложение и API-код.
- `src/main/resources/application.yaml` — настройки с переопределением через окружение.
- `pom.xml` — зависимости и Maven-сборка.

## Сборка

```sh
mvn -DskipTests package
```

Для этой версии проекта выбрана Java 25 LTS. Spring Boot 4.1.2 поддерживает Java 17–27, а Maven 3.6.3+; Java 25 является актуальной LTS-версией ([официальная документация Spring Boot](https://docs.spring.io/spring-boot/system-requirements.html), [дорожная карта Java](https://www.oracle.com/java/technologies/java-se-support-roadmap.html)).

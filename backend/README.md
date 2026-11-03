# Tandem API (Java / Spring Boot)

Backend разрабатывается на Java 25 LTS и Spring Boot 4.1.2. Слои организованы как `http → service → repo`; Hibernate/Spring Data JPA используются для стандартных CRUD-сценариев, `JdbcTemplate` остаётся доступен для специализированных запросов. Backend независим от frontend build и Cloudflare Worker. Миграции PostgreSQL принадлежат отдельному проекту `database/` и запускаются через Flyway.

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

Сервер слушает `0.0.0.0:8080` по умолчанию. Параметры приложения можно задать через `HTTP_HOST`, `HTTP_PORT`, `DB_URL`, `DB_USER`, `DB_PASSWORD` и `DB_POOL_SIZE`; секреты не хранятся в исходниках. Hibernate настроен на `ddl-auto: validate`: он проверяет соответствие entity-моделей уже созданной схеме и не создаёт/не меняет таблицы. Backend не запускает DDL/Flyway автоматически: сначала применяются миграции отдельным `database/`-проектом.

## Начальные маршруты

- `GET /healthz` → `{"status":"ok"}` — простой health-check, не проверяет доступность БД.
- `GET /actuator/health` — Spring Boot Actuator health; включает проверку DataSource.
- `GET /actuator/info` — информация о приложении.

Actuator наружу публикует только health и info, подробности health-ответа скрыты.

## Структура исходников и правила слоёв

- `src/main/java/com/tandem/api/http/` — контроллеры, входные/выходные HTTP DTO и обработка ошибок. Контроллеры вызывают сервисы, но не репозитории.
- `src/main/java/com/tandem/api/service/` — бизнес-сценарии, правила доступа и транзакционные границы.
- `src/main/java/com/tandem/api/repo/jpa/` — Spring Data JPA-репозитории; `repo/jdbc/` — SQL через `JdbcTemplate` для запросов, где ORM неудобен.
- `src/main/java/com/tandem/api/domain/` — общие модели и JPA-сущности.
- Функциональные подпакеты добавляются вместе с реализацией конкретного сценария; заранее не создаём пустые CRUD-классы.
- `src/main/resources/application.yaml` — настройки с переопределением через окружение.
- `pom.xml` — зависимости и Maven-сборка.

Зависимости направлены только от HTTP-слоя к сервисам и далее к репозиториям. Репозитории не вызывают сервисы или HTTP. Схема PostgreSQL изменяется только версионированными Flyway SQL-миграциями из `database/`.

## Сборка

```sh
mvn -DskipTests package
```

Для этой версии проекта выбрана Java 25 LTS. Spring Boot 4.1.2 поддерживает Java 17–27, а Maven 3.6.3+; Java 25 является актуальной LTS-версией ([официальная документация Spring Boot](https://docs.spring.io/spring-boot/system-requirements.html), [дорожная карта Java](https://www.oracle.com/java/technologies/java-se-support-roadmap.html)).

# Backend guidance

- Серверную разработку вести в Java/Spring Boot (`src/main/java`, `src/main/resources`). Сервис остаётся независимым от frontend build и Cloudflare Worker.
- PostgreSQL schema changes оформлять новыми Flyway migration в `database/src/main/resources/db/migration`; не запускать автоматический DDL из backend.
- Конфигурацию брать из переменных окружения; секреты не добавлять в исходники и committed examples.
- Целевая версия Java задаётся в `pom.xml`; проверять сборку командой `mvn -DskipTests package`.

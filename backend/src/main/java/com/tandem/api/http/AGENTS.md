# HTTP adapter rules

- Держать здесь Spring MVC controllers, HTTP request/response DTO, validation и HTTP exception mapping.
- Контроллер отвечает за протокол: binding, синтаксическую валидацию, вызов одного application use case и перевод результата в HTTP status/headers/body. Бизнес-сценарии и SQL здесь запрещены.
- Не внедрять repository, `JdbcTemplate`, `EntityManager` или JPA entity в controller.
- Не возвращать domain/JPA объекты напрямую. Явно маппить стабильные API DTO; синхронизировать их с `docs/backend/api.yaml`.
- Аутентифицированного пользователя получать из доверенного security context. Не определять пользователя по `userId`, `tutorId` или `studentId` из тела запроса.
- Использовать общую обработку ошибок и Problem Details. Не включать в ответы внутренние exception messages, stack traces, SQL или секреты.
- Не добавлять контроллеры-заглушки для ещё не реализованных OpenAPI операций.

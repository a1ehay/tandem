# Persistence adapter rules

- Здесь находятся реализации persistence ports: Spring Data JPA, Hibernate mapping и целевой `JdbcTemplate` SQL.
- JPA entities, Hibernate converters, row mappers и SQL-specific projections размещать во внешнем repo/persistence-слое, а не в чистом domain.
- Entity mapping должно соответствовать Flyway schema. Использовать `ddl-auto: validate`; не включать `create`, `update` или автоинициализацию DDL.
- Репозитории не принимают HTTP DTO, не формируют HTTP status и не реализуют пользовательские сценарии/проверки доступа.
- Возвращать доменные модели или явно определённые persistence результаты; не позволять ленивым JPA-связям утекать в web-слой.
- Предпочитать явные запросы и ограниченную загрузку нужных данных; контролировать N+1, пагинацию и объём JSONB.
- `JdbcTemplate` применять для конкретно обоснованных запросов. Не использовать JDBC параллельно с JPA для обычных CRUD-операций одной сущности без причины.
- Все изменения схемы оформлять новой SQL migration в `database/`; не менять уже применённую миграцию.

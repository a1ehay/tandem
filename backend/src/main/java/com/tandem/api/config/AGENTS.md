# Configuration and infrastructure rules

- Конфигурация связывает Spring и инфраструктуру, но не должна содержать бизнес-логику.
- Все изменяемые по окружению значения получать из external configuration/environment; production secrets не иметь в дефолтах и примерах.
- Не открывать Actuator, CORS, security endpoints или подробности health без явного требования и документирования.
- Настраивать соединение, таймауты, пул и graceful shutdown явно и согласованно с deployment configuration.
- Конфигурацию авторизации и внешних интеграций разделять по ответственности; credentials хранить только в secret store/runtime bindings.

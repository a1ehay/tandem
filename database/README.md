# Tandem database

PostgreSQL runs in the repository-level Docker Compose setup. Flyway migrations are maintained in this standalone Java/Maven project and run either from the host or from the Compose network. The database remains separate from the frontend, Cloudflare Worker, and Go backend.

## Requirements

- Java 17 or newer
- Maven 3.9+
- PostgreSQL 13 or newer

## Local development

Copy the local example file and start PostgreSQL:

```sh
cp .env.example .env
```

Edit `.env` and set a local password. Then:

```sh
docker compose up -d postgres
```

The Compose file binds the database only to loopback (`127.0.0.1`), so it is not directly exposed to the network. Data persists in the `tandem_postgres_data` Docker volume.

Apply migrations from the host:

```sh
set -a
. ./.env
set +a
mvn -q -f database/pom.xml compile exec:java
```

Or run the Java/Flyway migrator as a container on the Compose network:

```sh
docker compose --profile migrate run --rm migrate
```

Stop PostgreSQL and keep data with `docker compose down`. To remove the database volume too (destructive):

```sh
docker compose down -v
```

## Production on a Docker host

Provision a production host with Docker Engine and Compose, then create a protected `.env` there using the variable names from `.env.example`. Generate a unique password, for example with `openssl rand -base64 36`, and set both `POSTGRES_PASSWORD` and `DB_PASSWORD` to the same value. Never commit this file or copy local demo data to production.

```sh
cp .env.example .env
chmod 600 .env
# Edit .env on the production host and replace the placeholder secret before continuing.
docker compose up -d postgres
docker compose --profile migrate run --rm migrate
```

The same `compose.yaml` is used in production and binds PostgreSQL only to `127.0.0.1` on the host. Other containers on the same Compose network use `postgres:5432`; remote clients cannot connect directly. Use an SSH tunnel for remote administration. Restrict SSH and Docker host access, enable host firewalling, and configure encrypted off-host backups and restore checks before storing real user data. A Compose volume survives container replacement but is not a backup or high-availability setup.

For a managed PostgreSQL provider, do not run the PostgreSQL Compose service; set `DB_URL`, `DB_USER`, and `DB_PASSWORD` to the provider connection settings and run Flyway. The Java launcher requires these variables and does not load env files. Keep credentials in the host's secret store.

Flyway applies SQL files from `src/main/resources/db/migration` and records applied versions in `flyway_schema_history`. The initial schema is `V1__init.sql`. Never edit an applied migration; add a new versioned migration such as `V2__add_feature.sql`.

See [the database design](../docs/database/database.md) for entity rationale and constraints. This project only creates/upgrades the schema; it does not yet provide an application API or database connection to the Go service.

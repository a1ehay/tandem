package com.tandem.api.repo;

import static org.assertj.core.api.Assertions.*;

import com.tandem.api.TandemApiApplication;
import com.tandem.api.domain.model.UserRole;
import com.tandem.api.service.port.StorageException;
import com.tandem.api.service.port.UserRepository;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.boot.WebApplicationType;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.testcontainers.postgresql.PostgreSQLContainer;

class DatabaseUnavailableTest {
    @Test
    void failedConnectionAtTransactionBeginHasStorageErrorSemantics() {
        // Separate container/context: stopping it must not affect another suite or the developer
        // DB.
        try (PostgreSQLContainer database = new PostgreSQLContainer("postgres:17-alpine")) {
            database.start();
            Flyway.configure()
                    .dataSource(
                            database.getJdbcUrl(), database.getUsername(), database.getPassword())
                    .locations("filesystem:" + System.getProperty("tandem.migrations.path"))
                    .load()
                    .migrate();
            try (var context =
                    new SpringApplicationBuilder(TandemApiApplication.class)
                            .web(WebApplicationType.NONE)
                            .run(
                                    "--spring.datasource.url="
                                            + database.getJdbcUrl()
                                            + "&connectTimeout=1&socketTimeout=1",
                                    "--spring.datasource.username=" + database.getUsername(),
                                    "--spring.datasource.password=" + database.getPassword(),
                                    "--spring.datasource.hikari.connection-timeout=1000",
                                    "--spring.datasource.hikari.validation-timeout=500",
                                    "--spring.flyway.enabled=false",
                                    "--debug=false",
                                    "--logging.level.root=ERROR")) {
                var users = context.getBean(UserRepository.class);
                database.stop();
                assertThatThrownBy(
                                () ->
                                        users.create(
                                                "unavailable@example.com",
                                                "Недоступная БД",
                                                UserRole.TUTOR))
                        .isInstanceOfSatisfying(
                                StorageException.class,
                                failure -> {
                                    assertThat(failure.kind())
                                            .isEqualTo(StorageException.Kind.UNAVAILABLE);
                                    assertThat(failure.getCause()).isNotNull();
                                });
            }
        }
    }
}

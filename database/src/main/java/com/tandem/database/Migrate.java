package com.tandem.database;

import org.flywaydb.core.Flyway;

public final class Migrate {
    private Migrate() {
    }

    public static void main(String[] args) {
        String url = requiredEnv("DB_URL");
        String user = requiredEnv("DB_USER");
        String password = requiredEnv("DB_PASSWORD");

        Flyway.configure()
                .dataSource(url, user, password)
                .locations("classpath:db/migration")
                .validateMigrationNaming(true)
                .load()
                .migrate();
    }

    private static String requiredEnv(String name) {
        String value = System.getenv(name);
        if (value == null || value.isBlank()) {
            throw new IllegalStateException("Required environment variable is missing: " + name);
        }
        return value;
    }
}

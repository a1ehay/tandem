package com.tandem.api.service.port;

public final class StorageException extends RuntimeException {
    public enum Kind {
        UNIQUE,
        REFERENCE,
        CONSTRAINT,
        CONFLICT,
        UNAVAILABLE,
        UNEXPECTED
    }

    private final Kind kind;

    public StorageException(Kind kind, Throwable cause) {
        super("Storage operation failed: " + kind, cause);
        this.kind = kind;
    }

    public Kind kind() {
        return kind;
    }
}

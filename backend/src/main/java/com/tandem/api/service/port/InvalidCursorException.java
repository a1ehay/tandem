package com.tandem.api.service.port;

public final class InvalidCursorException extends RepositoryArgumentException {
    public InvalidCursorException(Throwable cause) {
        super("Invalid cursor for query", cause);
    }
}

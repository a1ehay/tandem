package com.tandem.api.service.port;

/** Invalid application-supplied query options, distinct from a storage outage. */
public class RepositoryArgumentException extends IllegalArgumentException {
    public RepositoryArgumentException(String message) {
        super(message);
    }

    public RepositoryArgumentException(String message, Throwable cause) {
        super(message, cause);
    }
}

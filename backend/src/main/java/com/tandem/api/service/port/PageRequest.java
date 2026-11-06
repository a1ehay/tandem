package com.tandem.api.service.port;

public record PageRequest(int limit, String cursor) {
    public PageRequest {
        if (limit < 1 || limit > 100)
            throw new IllegalArgumentException("limit must be between 1 and 100");
        if (cursor != null && cursor.length() > 512)
            throw new IllegalArgumentException("cursor is too long");
    }

    public static PageRequest first(int limit) {
        return new PageRequest(limit, null);
    }
}

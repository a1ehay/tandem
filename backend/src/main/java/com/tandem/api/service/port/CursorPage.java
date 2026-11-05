package com.tandem.api.service.port;

import java.util.List;
import java.util.Optional;

public record CursorPage<T>(List<T> items, Optional<String> nextCursor) {
    public CursorPage {
        items = List.copyOf(items);
        nextCursor = java.util.Objects.requireNonNull(nextCursor);
    }

    public boolean hasMore() {
        return nextCursor.isPresent();
    }
}

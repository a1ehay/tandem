package com.tandem.api.repo.jpa;

import com.tandem.api.service.port.CursorPage;
import com.tandem.api.service.port.PageRequest;

import jakarta.persistence.TypedQuery;

import java.util.List;
import java.util.Optional;
import java.util.function.Function;

final class Pages {
    private Pages() {}

    static <E, T> CursorPage<T> read(
            TypedQuery<E> query,
            PageRequest request,
            Function<E, T> mapper,
            Function<E, String> cursor) {
        List<E> rows = query.setMaxResults(request.limit() + 1).getResultList();
        boolean more = rows.size() > request.limit();
        List<E> page = more ? rows.subList(0, request.limit()) : rows;
        return new CursorPage<>(
                page.stream().map(mapper).toList(),
                more ? Optional.of(cursor.apply(page.getLast())) : Optional.empty());
    }
}

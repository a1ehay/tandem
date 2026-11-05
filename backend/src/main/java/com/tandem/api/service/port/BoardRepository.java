package com.tandem.api.service.port;

import com.tandem.api.domain.model.Board;
import com.tandem.api.domain.model.BoardElement;
import com.tandem.api.domain.model.BoardSummary;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface BoardRepository {
    Board create(UUID tutorId, String name);

    Optional<Board> findById(UUID id);

    CursorPage<BoardSummary> listOwned(UUID tutorId, PageRequest page);

    CursorPage<BoardSummary> listForStudent(UUID studentId, PageRequest page);

    Mutation rename(UUID id, UUID tutorId, String name);

    Mutation replaceElements(
            UUID id, UUID tutorId, Instant expectedUpdatedAt, List<BoardElement> elements);

    Mutation deleteUnreferenced(UUID id, UUID tutorId);
}

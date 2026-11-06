package com.tandem.api.repo.jpa;

import static com.tandem.api.repo.jpa.PersistenceGuard.call;
import static com.tandem.api.service.port.Mutation.*;

import com.tandem.api.domain.model.Board;
import com.tandem.api.domain.model.BoardElement;
import com.tandem.api.domain.model.BoardSummary;
import com.tandem.api.repo.jpa.entity.BoardEntity;
import com.tandem.api.service.port.BoardRepository;
import com.tandem.api.service.port.CursorPage;
import com.tandem.api.service.port.Mutation;
import com.tandem.api.service.port.PageRequest;

import jakarta.persistence.EntityManager;

import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;

@Repository
@Transactional(readOnly = true)
public class JpaBoardAdapter implements BoardRepository {
    private final BoardJpaRepository rows;
    private final EntityManager em;

    public JpaBoardAdapter(BoardJpaRepository rows, EntityManager em) {
        this.rows = rows;
        this.em = em;
    }

    @Override
    @Transactional
    public Board create(UUID tutorId, String name) {
        return call(
                () -> {
                    BoardEntity e = new BoardEntity();
                    e.id = UUID.randomUUID();
                    e.ownerTutorId = tutorId;
                    e.name = name;
                    e.elements = List.of();
                    em.persist(e);
                    em.flush();
                    em.refresh(e);
                    return EntityMapper.map(e);
                });
    }

    @Override
    public Optional<Board> findById(UUID id) {
        return call(() -> rows.findById(id).map(EntityMapper::map));
    }

    @Override
    public CursorPage<BoardSummary> listOwned(UUID tutorId, PageRequest page) {
        return listCards(tutorId, false, page);
    }

    @Override
    public CursorPage<BoardSummary> listForStudent(UUID studentId, PageRequest page) {
        return listCards(studentId, true, page);
    }

    private CursorPage<BoardSummary> listCards(
            UUID participantId, boolean student, PageRequest page) {
        String scope = "boards:" + student + ":" + participantId;
        Cursors.Position p = Cursors.read(page, scope);
        return call(
                () -> {
                    String hql =
                            "select new com.tandem.api.domain.model.BoardSummary(e.id,"
                                + " e.ownerTutorId, e.name, e.updatedAt) from BoardEntity e where ";
                    hql +=
                            student
                                    ? "exists (select 1 from LessonBoardEntity lb, LessonEntity l"
                                          + " where lb.id.boardId = e.id and l.id = lb.id.lessonId"
                                          + " and l.studentId = :participant)"
                                    : "e.ownerTutorId = :participant";
                    if (p != null)
                        hql += " and (e.updatedAt < :time or (e.updatedAt = :time and e.id > :id))";
                    var query =
                            em.createQuery(
                                            hql + " order by e.updatedAt desc, e.id",
                                            BoardSummary.class)
                                    .setParameter("participant", participantId);
                    if (p != null) query.setParameter("time", p.time()).setParameter("id", p.id());
                    return Pages.read(
                            query, page, e -> e, e -> Cursors.next(scope, e.updatedAt(), e.id()));
                });
    }

    @Override
    @Transactional
    public Mutation rename(UUID id, UUID tutorId, String name) {
        return call(
                () -> {
                    BoardEntity e = LockedRows.find(em, BoardEntity.class, id);
                    if (e == null || !e.ownerTutorId.equals(tutorId)) return NOT_FOUND;
                    e.name = name;
                    e.touch();
                    em.flush();
                    return UPDATED;
                });
    }

    @Override
    @Transactional
    public Mutation replaceElements(
            UUID id, UUID tutorId, Instant expectedUpdatedAt, List<BoardElement> elements) {
        Objects.requireNonNull(expectedUpdatedAt, "expectedUpdatedAt");
        return call(
                () -> {
                    BoardEntity e = LockedRows.find(em, BoardEntity.class, id);
                    if (e == null || !e.ownerTutorId.equals(tutorId)) return NOT_FOUND;
                    if (!e.updatedAt.equals(expectedUpdatedAt)) return CONFLICT;
                    e.elements = List.copyOf(elements);
                    e.touch();
                    em.flush();
                    return UPDATED;
                });
    }

    @Override
    @Transactional
    public Mutation deleteUnreferenced(UUID id, UUID tutorId) {
        return call(
                () -> {
                    BoardEntity e = LockedRows.find(em, BoardEntity.class, id);
                    if (e == null || !e.ownerTutorId.equals(tutorId)) return NOT_FOUND;
                    Long references =
                            em.createQuery(
                                            "select count(lb) from LessonBoardEntity lb where"
                                                    + " lb.id.boardId = :board",
                                            Long.class)
                                    .setParameter("board", id)
                                    .getSingleResult();
                    if (references > 0) return CONFLICT;
                    em.remove(e);
                    em.flush();
                    return UPDATED;
                });
    }
}

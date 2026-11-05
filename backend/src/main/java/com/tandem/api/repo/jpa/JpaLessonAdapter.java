package com.tandem.api.repo.jpa;

import static com.tandem.api.repo.jpa.PersistenceGuard.call;
import static com.tandem.api.service.port.Mutation.*;

import com.tandem.api.domain.model.Lesson;
import com.tandem.api.domain.model.LessonStatus;
import com.tandem.api.repo.jdbc.LessonOverlapQuery;
import com.tandem.api.repo.jpa.entity.LessonEntity;
import com.tandem.api.service.port.CursorPage;
import com.tandem.api.service.port.LessonFilter;
import com.tandem.api.service.port.LessonRepository;
import com.tandem.api.service.port.Mutation;
import com.tandem.api.service.port.PageRequest;

import jakarta.persistence.EntityManager;

import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;

@Repository
@Transactional(readOnly = true)
public class JpaLessonAdapter implements LessonRepository {
    private final LessonJpaRepository rows;
    private final EntityManager em;
    private final LessonOverlapQuery overlapQuery;

    public JpaLessonAdapter(
            LessonJpaRepository rows, EntityManager em, LessonOverlapQuery overlapQuery) {
        this.rows = rows;
        this.em = em;
        this.overlapQuery = overlapQuery;
    }

    @Override
    @Transactional
    public Lesson create(
            UUID tutorId, UUID studentId, String title, Instant startsAt, short durationMinutes) {
        return call(
                () -> {
                    LessonEntity e = new LessonEntity();
                    e.id = UUID.randomUUID();
                    e.tutorId = tutorId;
                    e.studentId = studentId;
                    e.title = title;
                    e.startsAt = startsAt;
                    e.durationMinutes = durationMinutes;
                    e.status = LessonStatus.SCHEDULED;
                    em.persist(e);
                    em.flush();
                    em.refresh(e);
                    return EntityMapper.map(e);
                });
    }

    @Override
    public Optional<Lesson> findById(UUID id) {
        return call(() -> rows.findById(id).map(EntityMapper::map));
    }

    @Override
    public CursorPage<Lesson> list(LessonFilter filter, PageRequest page) {
        String scope = "lessons:" + filter;
        Cursors.Position p = Cursors.read(page, scope);
        return call(
                () -> {
                    String hql = "select e from LessonEntity e where 1=1";
                    if (filter.tutorId() != null) hql += " and e.tutorId = :tutor";
                    if (filter.studentId() != null) hql += " and e.studentId = :student";
                    if (filter.from() != null) hql += " and e.startsAt >= :from";
                    if (filter.to() != null) hql += " and e.startsAt < :to";
                    if (filter.status() != null) hql += " and e.status = :status";
                    if (p != null)
                        hql += " and (e.startsAt > :time or (e.startsAt = :time and e.id > :id))";
                    var query =
                            em.createQuery(hql + " order by e.startsAt, e.id", LessonEntity.class);
                    if (filter.tutorId() != null) query.setParameter("tutor", filter.tutorId());
                    if (filter.studentId() != null)
                        query.setParameter("student", filter.studentId());
                    if (filter.from() != null) query.setParameter("from", filter.from());
                    if (filter.to() != null) query.setParameter("to", filter.to());
                    if (filter.status() != null) query.setParameter("status", filter.status());
                    if (p != null) query.setParameter("time", p.time()).setParameter("id", p.id());
                    return Pages.read(
                            query,
                            page,
                            EntityMapper::map,
                            e -> Cursors.next(scope, e.startsAt, e.id));
                });
    }

    @Override
    @Transactional
    public Mutation updateSchedule(
            UUID id, UUID tutorId, String title, Instant startsAt, short durationMinutes) {
        return call(
                () -> {
                    LessonEntity e = LockedRows.find(em, LessonEntity.class, id);
                    if (e == null || !e.tutorId.equals(tutorId)) return NOT_FOUND;
                    if (e.status != LessonStatus.SCHEDULED) return CONFLICT;
                    e.title = title;
                    e.startsAt = startsAt;
                    e.durationMinutes = durationMinutes;
                    e.touch();
                    em.flush();
                    return UPDATED;
                });
    }

    @Override
    @Transactional
    public Mutation changeStatus(UUID id, UUID tutorId, LessonStatus expected, LessonStatus next) {
        Objects.requireNonNull(expected);
        Objects.requireNonNull(next);
        return call(
                () -> {
                    LessonEntity e = LockedRows.find(em, LessonEntity.class, id);
                    if (e == null || !e.tutorId.equals(tutorId)) return NOT_FOUND;
                    if (e.status != expected) return CONFLICT;
                    e.status = next;
                    e.touch();
                    em.flush();
                    return UPDATED;
                });
    }

    @Override
    public boolean overlaps(UUID tutorId, Instant startsAt, short durationMinutes, UUID excludeId) {
        return call(
                () -> {
                    // Native interval arithmetic avoids loading lesson rows or JSON documents.
                    em.flush();
                    return overlapQuery.exists(tutorId, startsAt, durationMinutes, excludeId);
                });
    }
}

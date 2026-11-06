package com.tandem.api.repo.jpa;

import static com.tandem.api.repo.jpa.PersistenceGuard.call;
import static com.tandem.api.service.port.Mutation.*;

import com.tandem.api.domain.model.Task;
import com.tandem.api.domain.model.TaskKind;
import com.tandem.api.domain.model.TaskStatus;
import com.tandem.api.repo.jpa.entity.TaskEntity;
import com.tandem.api.service.port.CursorPage;
import com.tandem.api.service.port.Mutation;
import com.tandem.api.service.port.PageRequest;
import com.tandem.api.service.port.TaskFilter;
import com.tandem.api.service.port.TaskRepository;

import jakarta.persistence.EntityManager;

import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;

@Repository
@Transactional(readOnly = true)
public class JpaTaskAdapter implements TaskRepository {
    private final TaskJpaRepository rows;
    private final EntityManager em;

    public JpaTaskAdapter(TaskJpaRepository rows, EntityManager em) {
        this.rows = rows;
        this.em = em;
    }

    @Override
    @Transactional
    public Task create(
            UUID tutorId,
            UUID studentId,
            TaskKind kind,
            String title,
            String description,
            String subject,
            Instant dueAt) {
        return call(
                () -> {
                    TaskEntity e = new TaskEntity();
                    e.id = UUID.randomUUID();
                    e.tutorId = tutorId;
                    e.studentId = studentId;
                    e.kind = kind;
                    e.title = title;
                    e.description = description == null ? "" : description;
                    e.subject = subject;
                    e.dueAt = dueAt;
                    e.status = TaskStatus.TODO;
                    em.persist(e);
                    em.flush();
                    em.refresh(e);
                    return EntityMapper.map(e);
                });
    }

    @Override
    public Optional<Task> findById(UUID id) {
        return call(() -> rows.findById(id).map(EntityMapper::map));
    }

    @Override
    public CursorPage<Task> list(TaskFilter filter, PageRequest page) {
        String scope = "tasks:" + filter;
        Cursors.Position p = Cursors.read(page, scope, true);
        return call(
                () -> {
                    String hql = "select e from TaskEntity e where 1=1";
                    if (filter.tutorId() != null) hql += " and e.tutorId = :tutor";
                    if (filter.studentId() != null)
                        hql += " and e.studentId = :student and e.kind = :homework";
                    if (filter.kind() != null) hql += " and e.kind = :kind";
                    if (filter.status() != null) hql += " and e.status = :status";
                    if (filter.dueBefore() != null) hql += " and e.dueAt < :due";
                    if (p != null)
                        hql +=
                                p.time() == null
                                        ? " and e.dueAt is null and e.id > :id"
                                        : " and (e.dueAt > :time or (e.dueAt = :time and e.id >"
                                                + " :id) or e.dueAt is null)";
                    var query =
                            em.createQuery(
                                    hql + " order by e.dueAt asc nulls last, e.id",
                                    TaskEntity.class);
                    if (filter.tutorId() != null) query.setParameter("tutor", filter.tutorId());
                    if (filter.studentId() != null)
                        query.setParameter("student", filter.studentId())
                                .setParameter("homework", TaskKind.HOMEWORK);
                    if (filter.kind() != null) query.setParameter("kind", filter.kind());
                    if (filter.status() != null) query.setParameter("status", filter.status());
                    if (filter.dueBefore() != null) query.setParameter("due", filter.dueBefore());
                    if (p != null) {
                        query.setParameter("id", p.id());
                        if (p.time() != null) query.setParameter("time", p.time());
                    }
                    return Pages.read(
                            query,
                            page,
                            EntityMapper::map,
                            e -> Cursors.next(scope, e.dueAt, e.id));
                });
    }

    @Override
    @Transactional
    public Mutation updateContent(
            UUID id,
            UUID tutorId,
            String title,
            String description,
            String subject,
            Instant dueAt) {
        return call(
                () -> {
                    TaskEntity e = LockedRows.find(em, TaskEntity.class, id);
                    if (e == null || !e.tutorId.equals(tutorId)) return NOT_FOUND;
                    e.title = title;
                    e.description = description;
                    e.subject = subject;
                    e.dueAt = dueAt;
                    e.touch();
                    em.flush();
                    return UPDATED;
                });
    }

    @Override
    @Transactional
    public Mutation changeStatus(UUID id, TaskStatus expected, TaskStatus next) {
        Objects.requireNonNull(expected);
        Objects.requireNonNull(next);
        return call(
                () -> {
                    TaskEntity e = LockedRows.find(em, TaskEntity.class, id);
                    if (e == null) return NOT_FOUND;
                    if (e.status != expected) return CONFLICT;
                    e.status = next;
                    e.touch();
                    em.flush();
                    return UPDATED;
                });
    }
}

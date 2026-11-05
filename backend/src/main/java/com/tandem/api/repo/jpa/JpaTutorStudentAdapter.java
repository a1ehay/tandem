package com.tandem.api.repo.jpa;

import static com.tandem.api.repo.jpa.PersistenceGuard.call;
import static com.tandem.api.service.port.Mutation.*;

import com.tandem.api.domain.model.LinkStatus;
import com.tandem.api.domain.model.TutorStudent;
import com.tandem.api.repo.jpa.entity.TutorStudentEntity;
import com.tandem.api.repo.jpa.entity.TutorStudentKey;
import com.tandem.api.service.port.CursorPage;
import com.tandem.api.service.port.Mutation;
import com.tandem.api.service.port.PageRequest;
import com.tandem.api.service.port.TutorStudentRepository;

import jakarta.persistence.EntityManager;

import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import java.util.Optional;
import java.util.UUID;

@Repository
@Transactional(readOnly = true)
public class JpaTutorStudentAdapter implements TutorStudentRepository {
    private final TutorStudentJpaRepository rows;
    private final EntityManager em;

    public JpaTutorStudentAdapter(TutorStudentJpaRepository rows, EntityManager em) {
        this.rows = rows;
        this.em = em;
    }

    @Override
    @Transactional
    public TutorStudent create(
            UUID tutorId, UUID studentId, String subject, String gradeLabel, String privateNote) {
        return call(
                () -> {
                    TutorStudentEntity e = new TutorStudentEntity();
                    e.id = new TutorStudentKey(tutorId, studentId);
                    e.subject = subject;
                    e.gradeLabel = gradeLabel;
                    e.privateNote = privateNote == null ? "" : privateNote;
                    e.status = LinkStatus.ACTIVE;
                    em.persist(e);
                    em.flush();
                    em.refresh(e);
                    return EntityMapper.map(e);
                });
    }

    @Override
    public Optional<TutorStudent> find(UUID tutorId, UUID studentId) {
        return call(
                () ->
                        rows.findById(new TutorStudentKey(tutorId, studentId))
                                .map(EntityMapper::map));
    }

    @Override
    public CursorPage<TutorStudent> list(UUID tutorId, LinkStatus status, PageRequest page) {
        String scope = "links:" + tutorId + ":" + status;
        Cursors.Position p = Cursors.read(page, scope);
        return call(
                () -> {
                    String hql = "select e from TutorStudentEntity e where e.id.tutorId = :tutor";
                    if (status != null) hql += " and e.status = :status";
                    if (p != null)
                        hql +=
                                " and (e.createdAt > :time or (e.createdAt = :time and"
                                        + " e.id.studentId > :id))";
                    var query =
                            em.createQuery(
                                            hql + " order by e.createdAt, e.id.studentId",
                                            TutorStudentEntity.class)
                                    .setParameter("tutor", tutorId);
                    if (status != null) query.setParameter("status", status);
                    if (p != null) query.setParameter("time", p.time()).setParameter("id", p.id());
                    return Pages.read(
                            query,
                            page,
                            EntityMapper::map,
                            e -> Cursors.next(scope, e.createdAt, e.id.studentId));
                });
    }

    @Override
    @Transactional
    public Mutation update(
            UUID tutorId,
            UUID studentId,
            String subject,
            String gradeLabel,
            String privateNote,
            short progressPercent,
            LinkStatus status) {
        return call(
                () -> {
                    TutorStudentEntity e =
                            LockedRows.find(
                                    em,
                                    TutorStudentEntity.class,
                                    new TutorStudentKey(tutorId, studentId));
                    if (e == null) return NOT_FOUND;
                    e.subject = subject;
                    e.gradeLabel = gradeLabel;
                    e.privateNote = privateNote;
                    e.progressPercent = progressPercent;
                    e.status = status;
                    e.touch();
                    em.flush();
                    return UPDATED;
                });
    }
}

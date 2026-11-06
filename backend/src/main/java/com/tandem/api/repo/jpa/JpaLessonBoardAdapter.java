package com.tandem.api.repo.jpa;

import static com.tandem.api.repo.jpa.PersistenceGuard.call;
import static com.tandem.api.service.port.Mutation.*;

import com.tandem.api.domain.model.LessonBoard;
import com.tandem.api.repo.jdbc.LessonBoardInsert;
import com.tandem.api.repo.jpa.entity.LessonBoardEntity;
import com.tandem.api.repo.jpa.entity.LessonBoardKey;
import com.tandem.api.service.port.LessonBoardRepository;
import com.tandem.api.service.port.RepositoryArgumentException;

import jakarta.persistence.EntityManager;

import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

@Repository
@Transactional(readOnly = true)
public class JpaLessonBoardAdapter implements LessonBoardRepository {
    private final LessonBoardJpaRepository rows;
    private final EntityManager em;
    private final LessonBoardInsert insert;

    public JpaLessonBoardAdapter(
            LessonBoardJpaRepository rows, EntityManager em, LessonBoardInsert insert) {
        this.rows = rows;
        this.em = em;
        this.insert = insert;
    }

    @Override
    public List<LessonBoard> findByLessonId(UUID lessonId) {
        return call(() -> rows.findForLesson(lessonId).stream().map(EntityMapper::map).toList());
    }

    @Override
    public Map<UUID, List<LessonBoard>> findByLessonIds(Set<UUID> lessonIds) {
        if (lessonIds.size() > 100)
            throw new RepositoryArgumentException("at most 100 IDs per batch");
        if (lessonIds.isEmpty()) return Map.of();
        return call(
                () -> {
                    Map<UUID, List<LessonBoard>> result =
                            rows.findForLessons(lessonIds).stream()
                                    .map(EntityMapper::map)
                                    .collect(
                                            java.util.stream.Collectors.groupingBy(
                                                    LessonBoard::lessonId));
                    result.replaceAll((id, values) -> List.copyOf(values));
                    return Map.copyOf(result);
                });
    }

    @Override
    @Transactional
    public LessonBoard attach(UUID lessonId, UUID boardId) {
        return call(
                () -> {
                    // ON CONFLICT is atomic under concurrent attachment; no exception recovery in a
                    // broken transaction.
                    em.flush();
                    LessonBoard result = insert.attach(lessonId, boardId);
                    em.clear();
                    return result;
                });
    }

    @Override
    @Transactional
    public boolean detach(UUID lessonId, UUID boardId) {
        return call(
                () -> {
                    LessonBoardEntity e =
                            LockedRows.find(
                                    em,
                                    LessonBoardEntity.class,
                                    new LessonBoardKey(lessonId, boardId));
                    if (e == null) return false;
                    em.remove(e);
                    em.flush();
                    return true;
                });
    }
}

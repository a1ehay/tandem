package com.tandem.api.repo.jpa;

import com.tandem.api.repo.jpa.entity.LessonBoardEntity;
import com.tandem.api.repo.jpa.entity.LessonBoardKey;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Set;
import java.util.UUID;

interface LessonBoardJpaRepository extends JpaRepository<LessonBoardEntity, LessonBoardKey> {
    @Query(
            "select e from LessonBoardEntity e where e.id.lessonId = :lesson order by e.attachedAt,"
                    + " e.id.boardId")
    List<LessonBoardEntity> findForLesson(@Param("lesson") UUID lessonId);

    @Query(
            "select e from LessonBoardEntity e where e.id.lessonId in :lessons order by"
                    + " e.attachedAt, e.id.boardId")
    List<LessonBoardEntity> findForLessons(@Param("lessons") Set<UUID> lessonIds);
}

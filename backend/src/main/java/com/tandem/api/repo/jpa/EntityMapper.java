package com.tandem.api.repo.jpa;

import com.tandem.api.domain.model.Board;
import com.tandem.api.domain.model.Lesson;
import com.tandem.api.domain.model.LessonBoard;
import com.tandem.api.domain.model.Planner;
import com.tandem.api.domain.model.StudentProfile;
import com.tandem.api.domain.model.Task;
import com.tandem.api.domain.model.TutorStudent;
import com.tandem.api.domain.model.TutorSubscription;
import com.tandem.api.domain.model.User;
import com.tandem.api.repo.jpa.entity.BoardEntity;
import com.tandem.api.repo.jpa.entity.LessonBoardEntity;
import com.tandem.api.repo.jpa.entity.LessonEntity;
import com.tandem.api.repo.jpa.entity.PlannerEntity;
import com.tandem.api.repo.jpa.entity.StudentProfileEntity;
import com.tandem.api.repo.jpa.entity.TaskEntity;
import com.tandem.api.repo.jpa.entity.TutorStudentEntity;
import com.tandem.api.repo.jpa.entity.TutorSubscriptionEntity;
import com.tandem.api.repo.jpa.entity.UserEntity;

final class EntityMapper {
    private EntityMapper() {}

    static User map(UserEntity e) {
        return new User(e.id, e.email, e.displayName, e.role, e.createdAt, e.updatedAt);
    }

    static StudentProfile map(StudentProfileEntity e) {
        return new StudentProfile(e.userId, e.gradeLabel, e.createdAt, e.updatedAt);
    }

    static TutorSubscription map(TutorSubscriptionEntity e) {
        return new TutorSubscription(
                e.tutorId, e.planCode, e.status, e.periodEndsAt, e.createdAt, e.updatedAt);
    }

    static TutorStudent map(TutorStudentEntity e) {
        return new TutorStudent(
                e.id.tutorId,
                e.id.studentId,
                e.subject,
                e.gradeLabel,
                e.privateNote,
                e.progressPercent,
                e.status,
                e.createdAt,
                e.updatedAt);
    }

    static Lesson map(LessonEntity e) {
        return new Lesson(
                e.id,
                e.tutorId,
                e.studentId,
                e.title,
                e.startsAt,
                e.durationMinutes,
                e.status,
                e.createdAt,
                e.updatedAt);
    }

    static Task map(TaskEntity e) {
        return new Task(
                e.id,
                e.tutorId,
                e.studentId,
                e.kind,
                e.title,
                e.description,
                e.subject,
                e.dueAt,
                e.status,
                e.createdAt,
                e.updatedAt);
    }

    static Board map(BoardEntity e) {
        return new Board(e.id, e.ownerTutorId, e.name, e.elements, e.createdAt, e.updatedAt);
    }

    static LessonBoard map(LessonBoardEntity e) {
        return new LessonBoard(e.id.lessonId, e.id.boardId, e.attachedAt);
    }

    static Planner map(PlannerEntity e) {
        return new Planner(e.ownerTutorId, e.title, e.blocks, e.createdAt, e.updatedAt);
    }
}

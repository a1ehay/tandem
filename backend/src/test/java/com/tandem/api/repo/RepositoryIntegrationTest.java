package com.tandem.api.repo;

import static com.tandem.api.service.port.Mutation.*;

import static org.assertj.core.api.Assertions.*;

import com.tandem.api.domain.model.Board;
import com.tandem.api.domain.model.BoardElement;
import com.tandem.api.domain.model.BoardElementType;
import com.tandem.api.domain.model.BoardSummary;
import com.tandem.api.domain.model.Lesson;
import com.tandem.api.domain.model.LessonStatus;
import com.tandem.api.domain.model.LinkStatus;
import com.tandem.api.domain.model.PlanCode;
import com.tandem.api.domain.model.Planner;
import com.tandem.api.domain.model.PlannerBlock;
import com.tandem.api.domain.model.PlannerBlockType;
import com.tandem.api.domain.model.Point;
import com.tandem.api.domain.model.SubscriptionStatus;
import com.tandem.api.domain.model.Task;
import com.tandem.api.domain.model.TaskKind;
import com.tandem.api.domain.model.TaskStatus;
import com.tandem.api.domain.model.User;
import com.tandem.api.domain.model.UserRole;
import com.tandem.api.service.port.BoardRepository;
import com.tandem.api.service.port.CursorPage;
import com.tandem.api.service.port.LessonBoardRepository;
import com.tandem.api.service.port.LessonFilter;
import com.tandem.api.service.port.LessonRepository;
import com.tandem.api.service.port.Mutation;
import com.tandem.api.service.port.PageRequest;
import com.tandem.api.service.port.PlannerRepository;
import com.tandem.api.service.port.StorageException;
import com.tandem.api.service.port.StudentProfileRepository;
import com.tandem.api.service.port.TaskFilter;
import com.tandem.api.service.port.TaskRepository;
import com.tandem.api.service.port.TutorStudentRepository;
import com.tandem.api.service.port.TutorSubscriptionRepository;
import com.tandem.api.service.port.UserRepository;

import jakarta.persistence.EntityManagerFactory;

import org.flywaydb.core.Flyway;
import org.hibernate.SessionFactory;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.support.TransactionTemplate;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.*;
import java.util.function.Function;
import java.util.function.Supplier;

@Testcontainers
@SpringBootTest(
        webEnvironment = SpringBootTest.WebEnvironment.NONE,
        properties = {
            "spring.jpa.hibernate.ddl-auto=validate",
            "spring.jpa.properties.hibernate.generate_statistics=true",
            "spring.flyway.enabled=false",
            "logging.level.root=WARN",
            "debug=false"
        })
class RepositoryIntegrationTest {
    @Container
    static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer("postgres:17-alpine");

    @DynamicPropertySource
    static void database(DynamicPropertyRegistry registry) {
        POSTGRES.start();
        Flyway.configure()
                .dataSource(POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword())
                .locations("filesystem:" + System.getProperty("tandem.migrations.path"))
                .load()
                .migrate();
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
        registry.add("spring.datasource.hikari.connection-timeout", () -> "1000");
    }

    @Autowired UserRepository users;
    @Autowired StudentProfileRepository profiles;
    @Autowired TutorSubscriptionRepository subscriptions;
    @Autowired TutorStudentRepository links;
    @Autowired LessonRepository lessons;
    @Autowired TaskRepository tasks;
    @Autowired BoardRepository boards;
    @Autowired LessonBoardRepository attachments;
    @Autowired PlannerRepository planners;
    @Autowired TransactionTemplate transactions;
    @Autowired JdbcTemplate jdbc;
    @Autowired EntityManagerFactory emf;

    record Participants(User tutor, User student) {}

    @BeforeEach
    void cleanDatabase() {
        jdbc.execute("truncate users cascade");
    }

    private User user(UserRole role) {
        return users.create(UUID.randomUUID() + "@example.com", "Имя", role);
    }

    private Participants participants() {
        User tutor = user(UserRole.TUTOR), student = user(UserRole.STUDENT);
        profiles.create(student.id(), "8 класс");
        links.create(tutor.id(), student.id(), "Математика", "8 класс", "Приватная заметка");
        return new Participants(tutor, student);
    }

    private Lesson lesson(Participants p, Instant startsAt) {
        return lessons.create(p.tutor.id(), p.student.id(), "Алгебра", startsAt, (short) 60);
    }

    private static void failure(StorageException.Kind kind, Runnable action) {
        assertThatThrownBy(action::run)
                .isInstanceOfSatisfying(
                        StorageException.class,
                        e -> {
                            assertThat(e.kind()).isEqualTo(kind);
                            assertThat(e.getCause()).isNotNull();
                            assertThat(e.getMessage())
                                    .doesNotContain("SQL", "insert into", "select ");
                        });
    }

    @Test
    void allPortsAreInjectedAndReadMissingRecordsWithoutNull() {
        UUID missing = UUID.randomUUID();
        assertThat(users.findById(missing)).isEmpty();
        assertThat(users.findByEmail("missing@example.com")).isEmpty();
        assertThat(profiles.findByUserId(missing)).isEmpty();
        assertThat(subscriptions.findByTutorId(missing)).isEmpty();
        assertThat(links.find(missing, missing)).isEmpty();
        assertThat(lessons.findById(missing)).isEmpty();
        assertThat(tasks.findById(missing)).isEmpty();
        assertThat(boards.findById(missing)).isEmpty();
        assertThat(planners.findByTutorId(missing)).isEmpty();
        assertThat(attachments.findByLessonId(missing)).isEmpty();
        assertThat(users.updateDisplayName(missing, "Имя")).isEqualTo(NOT_FOUND);
        assertThat(profiles.updateGrade(missing, "9 класс")).isEqualTo(NOT_FOUND);
        assertThat(
                        links.update(
                                missing,
                                missing,
                                "Предмет",
                                null,
                                "",
                                (short) 0,
                                LinkStatus.ACTIVE))
                .isEqualTo(NOT_FOUND);
        assertThat(lessons.updateSchedule(missing, missing, "Тема", Instant.now(), (short) 60))
                .isEqualTo(NOT_FOUND);
        assertThat(tasks.updateContent(missing, missing, "Задача", "", null, null))
                .isEqualTo(NOT_FOUND);
        assertThat(tasks.changeStatus(missing, TaskStatus.TODO, TaskStatus.COMPLETE))
                .isEqualTo(NOT_FOUND);
        assertThat(
                        lessons.changeStatus(
                                missing, missing, LessonStatus.SCHEDULED, LessonStatus.CANCELED))
                .isEqualTo(NOT_FOUND);
        assertThat(boards.rename(missing, missing, "Доска")).isEqualTo(NOT_FOUND);
        assertThat(boards.replaceElements(missing, missing, Instant.EPOCH, List.of()))
                .isEqualTo(NOT_FOUND);
        assertThat(boards.deleteUnreferenced(missing, missing)).isEqualTo(NOT_FOUND);
        assertThat(planners.replace(missing, Instant.EPOCH, "План", List.of()))
                .isEqualTo(NOT_FOUND);
        assertThat(attachments.detach(missing, missing)).isFalse();
    }

    @Test
    void userProfileSubscriptionMappingAndCaseInsensitiveEmailUniqueness() {
        User u = users.create("Student@Example.com", "Мария", UserRole.STUDENT);
        assertThat(users.findByEmail("STUDENT@example.COM")).contains(u);
        assertThat(users.findById(u.id())).contains(u);
        failure(
                StorageException.Kind.UNIQUE,
                () -> users.create("student@example.com", "Дубликат", UserRole.STUDENT));
        assertThat(users.updateDisplayName(u.id(), "Новое имя")).isEqualTo(UPDATED);
        assertThat(users.findById(u.id()).orElseThrow().displayName()).isEqualTo("Новое имя");
        var profile = profiles.create(u.id(), "8 класс");
        assertThat(profiles.findByUserId(u.id())).contains(profile);
        assertThat(profiles.updateGrade(u.id(), null)).isEqualTo(UPDATED);
        assertThat(profiles.findByUserId(u.id()).orElseThrow().gradeLabel()).isNull();
        failure(StorageException.Kind.UNIQUE, () -> profiles.create(u.id(), "9 класс"));
        User tutor = user(UserRole.TUTOR);
        Instant end = Instant.parse("2027-01-01T10:00:00.123456Z");
        var subscription =
                subscriptions.createInitial(
                        tutor.id(), PlanCode.EXTREME, SubscriptionStatus.TRIALING, end);
        assertThat(subscriptions.findByTutorId(tutor.id())).contains(subscription);
        assertThat(subscription.periodEndsAt()).isEqualTo(end);
        failure(
                StorageException.Kind.UNIQUE,
                () ->
                        subscriptions.createInitial(
                                tutor.id(), PlanCode.LIGHT, SubscriptionStatus.ACTIVE, null));
    }

    @Test
    void compositeLinkKeyFilteringAndConstraints() {
        Participants p = participants();
        User secondTutor = user(UserRole.TUTOR);
        links.create(secondTutor.id(), p.student.id(), "Физика", null, "");
        assertThat(links.find(p.tutor.id(), p.student.id()).orElseThrow().privateNote())
                .isEqualTo("Приватная заметка");
        failure(
                StorageException.Kind.UNIQUE,
                () -> links.create(p.tutor.id(), p.student.id(), "Повтор", null, ""));
        assertThat(
                        links.update(
                                p.tutor.id(),
                                p.student.id(),
                                "Геометрия",
                                "9 класс",
                                "Новая заметка",
                                (short) 80,
                                LinkStatus.ARCHIVED))
                .isEqualTo(UPDATED);
        assertThat(links.list(p.tutor.id(), LinkStatus.ACTIVE, PageRequest.first(20)).items())
                .isEmpty();
        var result = links.list(p.tutor.id(), LinkStatus.ARCHIVED, PageRequest.first(20)).items();
        assertThat(result).hasSize(1);
        assertThat(result.getFirst().progressPercent()).isEqualTo((short) 80);
        failure(
                StorageException.Kind.CONSTRAINT,
                () ->
                        links.update(
                                p.tutor.id(),
                                p.student.id(),
                                "Геометрия",
                                null,
                                "",
                                (short) 101,
                                LinkStatus.ACTIVE));
        failure(StorageException.Kind.REFERENCE, () -> profiles.create(UUID.randomUUID(), "Класс"));
        failure(
                StorageException.Kind.REFERENCE,
                () -> links.create(p.tutor.id(), UUID.randomUUID(), "Предмет", null, ""));
        failure(
                StorageException.Kind.CONSTRAINT,
                () -> users.create("invalid@example.com", "   ", UserRole.TUTOR));
        failure(
                StorageException.Kind.CONSTRAINT,
                () ->
                        tasks.create(
                                p.tutor.id(),
                                p.student.id(),
                                TaskKind.PERSONAL,
                                "Неверная задача",
                                "",
                                null,
                                null));
    }

    @Test
    void lessonsFilterScheduleStatusesAndOverlapBoundaries() {
        Participants p = participants();
        Instant start = Instant.parse("2027-03-01T10:00:00.123456Z");
        Lesson first = lesson(p, start), next = lesson(p, start.plusSeconds(3600));
        assertThat(lessons.findById(first.id())).contains(first);
        assertThat(lessons.overlaps(p.tutor.id(), start.minusSeconds(60), (short) 15, null))
                .isTrue();
        assertThat(lessons.overlaps(p.tutor.id(), start.minusSeconds(3600), (short) 60, null))
                .isFalse();
        assertThat(lessons.overlaps(p.tutor.id(), start, (short) 60, first.id())).isFalse();
        assertThat(lessons.overlaps(UUID.randomUUID(), start, (short) 60, null)).isFalse();
        var filter =
                new LessonFilter(
                        p.tutor.id(),
                        p.student.id(),
                        start,
                        start.plusSeconds(3600),
                        LessonStatus.SCHEDULED);
        assertThat(lessons.list(filter, PageRequest.first(20)).items()).containsExactly(first);
        assertThat(
                        lessons.updateSchedule(
                                first.id(),
                                p.tutor.id(),
                                "Новая тема",
                                start.minusSeconds(7200),
                                (short) 45))
                .isEqualTo(UPDATED);
        assertThat(lessons.findById(first.id()).orElseThrow().durationMinutes())
                .isEqualTo((short) 45);
        assertThat(
                        lessons.changeStatus(
                                first.id(),
                                p.tutor.id(),
                                LessonStatus.SCHEDULED,
                                LessonStatus.IN_PROGRESS))
                .isEqualTo(UPDATED);
        assertThat(
                        lessons.changeStatus(
                                first.id(),
                                p.tutor.id(),
                                LessonStatus.SCHEDULED,
                                LessonStatus.CANCELED))
                .isEqualTo(CONFLICT);
        assertThat(lessons.updateSchedule(first.id(), p.tutor.id(), "Тема", start, (short) 60))
                .isEqualTo(CONFLICT);
        assertThat(lessons.findById(next.id()).orElseThrow().startsAt())
                .isEqualTo(start.plusSeconds(3600));
        failure(
                StorageException.Kind.REFERENCE,
                () -> lessons.create(p.tutor.id(), UUID.randomUUID(), "Тема", start, (short) 60));
        failure(
                StorageException.Kind.CONSTRAINT,
                () -> lessons.create(p.tutor.id(), p.student.id(), "Тема", start, (short) 1));
    }

    @Test
    void taskContentStatusesAndScopedNullLastPagination() {
        Participants p = participants();
        Instant due = Instant.parse("2027-04-01T00:00:00Z");
        List<Task> created = new ArrayList<>();
        for (int i = 0; i < 5; i++)
            created.add(
                    tasks.create(
                            p.tutor.id(),
                            p.student.id(),
                            TaskKind.HOMEWORK,
                            "Задание " + i,
                            "Текст",
                            "Математика",
                            i < 3 ? due : null));
        Task personal =
                tasks.create(p.tutor.id(), null, TaskKind.PERSONAL, "Подготовка", "", null, null);
        var filter = new TaskFilter(null, p.student.id(), TaskKind.HOMEWORK, TaskStatus.TODO, null);
        List<Task> collected = collect(page -> tasks.list(filter, page), 2);
        assertThat(collected).hasSize(5);
        assertThat(collected.stream().map(Task::id).distinct()).hasSize(5);
        assertThat(collected.subList(0, 3)).allMatch(t -> t.dueAt().equals(due));
        assertThat(collected.subList(3, 5)).allMatch(t -> t.dueAt() == null);
        assertThat(collected).doesNotContain(personal);
        assertThat(
                        tasks.list(
                                        new TaskFilter(
                                                p.tutor.id(), null, null, null, due.plusSeconds(1)),
                                        PageRequest.first(20))
                                .items())
                .hasSize(3);
        Task task = created.getFirst();
        assertThat(
                        tasks.updateContent(
                                task.id(), p.tutor.id(), "Изменено", "Новый текст", null, null))
                .isEqualTo(UPDATED);
        assertThat(tasks.findById(task.id()).orElseThrow().description()).isEqualTo("Новый текст");
        assertThat(tasks.changeStatus(task.id(), TaskStatus.TODO, TaskStatus.SUBMITTED))
                .isEqualTo(UPDATED);
        assertThat(tasks.changeStatus(task.id(), TaskStatus.TODO, TaskStatus.COMPLETE))
                .isEqualTo(CONFLICT);
        failure(
                StorageException.Kind.CONSTRAINT,
                () -> tasks.changeStatus(personal.id(), TaskStatus.TODO, TaskStatus.SUBMITTED));
    }

    @Test
    void lessonAndLinkCursorPagesHaveStableTiesAndRejectChangedFilters() {
        Participants p = participants();
        Instant start = Instant.parse("2027-05-01T10:00:00Z");
        for (int i = 0; i < 5; i++) lesson(p, start);
        var filter = new LessonFilter(p.tutor.id(), null, null, null, null);
        List<Lesson> all = collect(page -> lessons.list(filter, page), 2);
        assertThat(all).hasSize(5);
        assertThat(all.stream().map(Lesson::id).distinct()).hasSize(5);
        String cursor = lessons.list(filter, PageRequest.first(2)).nextCursor().orElseThrow();
        assertThatThrownBy(
                        () ->
                                lessons.list(
                                        new LessonFilter(
                                                p.tutor.id(),
                                                null,
                                                null,
                                                null,
                                                LessonStatus.SCHEDULED),
                                        new PageRequest(2, cursor)))
                .isInstanceOf(IllegalArgumentException.class);
        for (int i = 0; i < 4; i++) {
            User student = user(UserRole.STUDENT);
            profiles.create(student.id(), null);
            links.create(p.tutor.id(), student.id(), "Предмет", null, "");
        }
        jdbc.update("update tutor_students set created_at = ?", java.sql.Timestamp.from(start));
        assertThat(collect(page -> links.list(p.tutor.id(), null, page), 2)).hasSize(5);
        assertThatThrownBy(() -> new PageRequest(0, null))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> lessons.list(filter, new PageRequest(2, "not a cursor")))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void boardJsonMappingAttachmentsDeletionAndLightweightCards() {
        Participants p = participants();
        Board board = boards.create(p.tutor.id(), "Общая доска");
        var element =
                new BoardElement(
                        "e1",
                        BoardElementType.path,
                        "#112233",
                        2.5,
                        List.of(new Point(.1, .2), new Point(.3, .4)),
                        null,
                        null,
                        null,
                        null,
                        null,
                        null,
                        null,
                        null,
                        "Текст",
                        null,
                        null);
        assertThat(
                        boards.replaceElements(
                                board.id(), p.tutor.id(), board.updatedAt(), List.of(element)))
                .isEqualTo(UPDATED);
        Board saved = boards.findById(board.id()).orElseThrow();
        assertThat(saved.elements()).containsExactly(element);
        assertThat(saved.updatedAt()).isAfter(board.updatedAt());
        assertThat(boards.replaceElements(board.id(), p.tutor.id(), board.updatedAt(), List.of()))
                .isEqualTo(CONFLICT);
        assertThat(boards.rename(board.id(), p.tutor.id(), "Переименована")).isEqualTo(UPDATED);
        Lesson first = lesson(p, Instant.parse("2027-06-01T12:00:00Z"));
        Lesson second = lesson(p, Instant.parse("2027-06-02T12:00:00Z"));
        var attachment = attachments.attach(first.id(), board.id());
        assertThat(attachments.attach(first.id(), board.id())).isEqualTo(attachment);
        attachments.attach(second.id(), board.id());
        assertThat(attachments.findByLessonId(first.id())).containsExactly(attachment);
        assertThat(boards.listForStudent(p.student.id(), PageRequest.first(20)).items()).hasSize(1);
        assertThat(boards.deleteUnreferenced(board.id(), p.tutor.id())).isEqualTo(CONFLICT);
        assertThat(attachments.detach(first.id(), board.id())).isTrue();
        assertThat(attachments.detach(first.id(), board.id())).isFalse();
        assertThat(attachments.detach(second.id(), board.id())).isTrue();
        failure(
                StorageException.Kind.REFERENCE,
                () -> attachments.attach(UUID.randomUUID(), board.id()));
        var stats = emf.unwrap(SessionFactory.class).getStatistics();
        stats.clear();
        assertThat(boards.listOwned(p.tutor.id(), PageRequest.first(20)).items()).hasSize(1);
        assertThat(stats.getEntityLoadCount()).isZero();
        assertThat(stats.getPrepareStatementCount()).isEqualTo(1);
        assertThat(boards.deleteUnreferenced(board.id(), p.tutor.id())).isEqualTo(UPDATED);
        assertThat(boards.findById(board.id())).isEmpty();
    }

    @Test
    void boardCursorOrderAndScope() {
        Participants p = participants();
        for (int i = 0; i < 5; i++) boards.create(p.tutor.id(), "Доска " + i);
        Instant now = Instant.parse("2027-06-01T00:00:00Z");
        jdbc.update("update boards set updated_at = ?", java.sql.Timestamp.from(now));
        var all = collect(page -> boards.listOwned(p.tutor.id(), page), 2);
        assertThat(all).hasSize(5);
        assertThat(all.stream().map(BoardSummary::id).distinct()).hasSize(5);
        String cursor =
                boards.listOwned(p.tutor.id(), PageRequest.first(2)).nextCursor().orElseThrow();
        assertThatThrownBy(() -> boards.listOwned(UUID.randomUUID(), new PageRequest(2, cursor)))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void plannerJsonRoundTripAndMonotonicConditionalReplacement() {
        User tutor = user(UserRole.TUTOR);
        var blocks =
                List.of(new PlannerBlock("b1", PlannerBlockType.todo, "Подготовить урок", false));
        Planner initial = planners.create(tutor.id(), "План", blocks);
        assertThat(planners.findByTutorId(tutor.id())).contains(initial);
        assertThat(
                        planners.replace(
                                tutor.id(),
                                initial.updatedAt(),
                                "Новый план",
                                List.of(
                                        new PlannerBlock(
                                                "b1", PlannerBlockType.todo, "Готово", true))))
                .isEqualTo(UPDATED);
        Planner saved = planners.findByTutorId(tutor.id()).orElseThrow();
        assertThat(saved.blocks().getFirst().checked()).isTrue();
        assertThat(saved.updatedAt()).isAfter(initial.updatedAt());
        assertThat(planners.replace(tutor.id(), initial.updatedAt(), "Устарело", List.of()))
                .isEqualTo(CONFLICT);
        failure(
                StorageException.Kind.UNIQUE,
                () -> planners.create(tutor.id(), "Дубликат", List.of()));
    }

    @Test
    void concurrentDocumentAndStatusWritesDetectStaleState() throws Exception {
        Participants p = participants();
        Board board = boards.create(p.tutor.id(), "Concurrent");
        assertRace(
                () ->
                        boards.replaceElements(
                                board.id(), p.tutor.id(), board.updatedAt(), List.of()));
        Planner planner = planners.create(p.tutor.id(), "Concurrent", List.of());
        assertRace(
                () -> planners.replace(p.tutor.id(), planner.updatedAt(), "Изменено", List.of()));
        Task task =
                tasks.create(
                        p.tutor.id(),
                        p.student.id(),
                        TaskKind.HOMEWORK,
                        "Concurrent",
                        "",
                        null,
                        null);
        assertRace(() -> tasks.changeStatus(task.id(), TaskStatus.TODO, TaskStatus.SUBMITTED));
        Lesson lesson = lesson(p, Instant.parse("2027-07-01T00:00:00Z"));
        assertRace(
                () ->
                        lessons.changeStatus(
                                lesson.id(),
                                p.tutor.id(),
                                LessonStatus.SCHEDULED,
                                LessonStatus.IN_PROGRESS));
    }

    @Test
    void outerTransactionRollsBackMultiplePortsIncludingJdbc() {
        User tutor = user(UserRole.TUTOR);
        UUID[] createdId = new UUID[1];
        assertThatThrownBy(
                        () ->
                                transactions.executeWithoutResult(
                                        status -> {
                                            User student = user(UserRole.STUDENT);
                                            createdId[0] = student.id();
                                            profiles.create(student.id(), null);
                                            links.create(
                                                    tutor.id(), student.id(), "Предмет", null, "");
                                            Lesson lesson =
                                                    lessons.create(
                                                            tutor.id(),
                                                            student.id(),
                                                            "Тема",
                                                            Instant.parse("2027-08-01T00:00:00Z"),
                                                            (short) 60);
                                            Board board = boards.create(tutor.id(), "Доска");
                                            attachments.attach(lesson.id(), board.id());
                                            assertThat(
                                                            lessons.overlaps(
                                                                    tutor.id(),
                                                                    lesson.startsAt(),
                                                                    (short) 60,
                                                                    null))
                                                    .isTrue();
                                            throw new IllegalStateException("rollback");
                                        }))
                .isInstanceOf(IllegalStateException.class);
        assertThat(users.findById(createdId[0])).isEmpty();
        assertThat(links.list(tutor.id(), null, PageRequest.first(20)).items()).isEmpty();
        assertThat(boards.listOwned(tutor.id(), PageRequest.first(20)).items()).isEmpty();
        assertThat(jdbc.queryForObject("select count(*) from lesson_boards", Integer.class))
                .isZero();
    }

    @Test
    void staleManagedEntitiesAreRefreshedBeforeConditionalWrites() throws Exception {
        Participants p = participants();
        Board board = boards.create(p.tutor.id(), "Доска");
        transactions.executeWithoutResult(
                status -> {
                    Board prior = boards.findById(board.id()).orElseThrow();
                    try (ExecutorService executor = Executors.newSingleThreadExecutor()) {
                        try {
                            assertThat(
                                            executor.submit(
                                                            () ->
                                                                    boards.replaceElements(
                                                                            board.id(),
                                                                            p.tutor.id(),
                                                                            prior.updatedAt(),
                                                                            List.of()))
                                                    .get(20, TimeUnit.SECONDS))
                                    .isEqualTo(UPDATED);
                        } catch (Exception failure) {
                            throw new AssertionError(failure);
                        }
                    }
                    assertThat(
                                    boards.replaceElements(
                                            board.id(), p.tutor.id(), prior.updatedAt(), List.of()))
                            .isEqualTo(CONFLICT);
                });
        assertThat(boards.rename(board.id(), UUID.randomUUID(), "Чужая")).isEqualTo(NOT_FOUND);
    }

    @Test
    void constraintFailureRollsBackWholeServiceTransaction() {
        User tutor = user(UserRole.TUTOR);
        UUID[] created = new UUID[1];
        failure(
                StorageException.Kind.UNIQUE,
                () ->
                        transactions.executeWithoutResult(
                                status -> {
                                    User student = user(UserRole.STUDENT);
                                    created[0] = student.id();
                                    profiles.create(student.id(), "Класс");
                                    links.create(tutor.id(), student.id(), "Предмет", null, "");
                                    users.create(
                                            tutor.email().toUpperCase(Locale.ROOT),
                                            "Дубликат",
                                            UserRole.TUTOR);
                                }));
        assertThat(users.findById(created[0])).isEmpty();
        assertThat(profiles.findByUserId(created[0])).isEmpty();
        assertThat(links.find(tutor.id(), created[0])).isEmpty();
    }

    @Test
    void timestampPrecisionIsReadBackFromPostgresAndEmptyPagesTerminate() {
        Participants p = participants();
        Lesson created = lesson(p, Instant.parse("2027-01-01T10:00:00.123456789Z"));
        assertThat(lessons.findById(created.id())).contains(created);
        assertThat(created.startsAt().getNano() % 1000).isZero();
        var empty =
                tasks.list(
                        new TaskFilter(p.tutor.id(), null, null, null, null),
                        PageRequest.first(100));
        assertThat(empty.items()).isEmpty();
        assertThat(empty.nextCursor()).isEmpty();
        assertThatThrownBy(() -> new PageRequest(101, null))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void batchLookupsAvoidPerRowQueriesAndBoundBatchSize() {
        Participants p = participants();
        User other = user(UserRole.STUDENT);
        UUID missing = UUID.randomUUID();
        var stats = emf.unwrap(SessionFactory.class).getStatistics();
        stats.clear();
        assertThat(users.findByIds(Set.of(p.tutor.id(), p.student.id(), other.id(), missing)))
                .containsOnlyKeys(p.tutor.id(), p.student.id(), other.id());
        assertThat(stats.getPrepareStatementCount()).isEqualTo(1);
        assertThat(users.findByIds(Set.of())).isEmpty();
        Lesson first = lesson(p, Instant.parse("2027-09-01T00:00:00Z"));
        Lesson second = lesson(p, Instant.parse("2027-09-02T00:00:00Z"));
        Board board = boards.create(p.tutor.id(), "Доска");
        attachments.attach(first.id(), board.id());
        attachments.attach(second.id(), board.id());
        stats.clear();
        var grouped = attachments.findByLessonIds(Set.of(first.id(), second.id(), missing));
        assertThat(grouped).containsOnlyKeys(first.id(), second.id());
        assertThat(grouped.get(first.id())).hasSize(1);
        assertThat(stats.getPrepareStatementCount()).isEqualTo(1);
        assertThat(attachments.findByLessonIds(Set.of())).isEmpty();
        Set<UUID> tooMany = new HashSet<>();
        for (int i = 0; i < 101; i++) tooMany.add(UUID.randomUUID());
        assertThatThrownBy(() -> users.findByIds(tooMany))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> attachments.findByLessonIds(tooMany))
                .isInstanceOf(IllegalArgumentException.class);
        assertThat(users.findByEmail("' OR 1=1 --")).isEmpty();
    }

    @Test
    void allDocumentElementTypesRoundTripAndAttachmentsAreConcurrentIdempotent() throws Exception {
        Participants p = participants();
        Board board = boards.create(p.tutor.id(), "Документ");
        List<BoardElement> elements =
                Arrays.stream(BoardElementType.values())
                        .map(
                                type ->
                                        new BoardElement(
                                                type.name(),
                                                type,
                                                "#123456",
                                                2.0,
                                                List.of(new Point(.1, .2)),
                                                .1,
                                                .2,
                                                .3,
                                                .4,
                                                .1,
                                                .2,
                                                .3,
                                                .4,
                                                "Текст",
                                                "#ffffff",
                                                20.0))
                        .toList();
        assertThat(boards.replaceElements(board.id(), p.tutor.id(), board.updatedAt(), elements))
                .isEqualTo(UPDATED);
        assertThat(boards.findById(board.id()).orElseThrow().elements()).isEqualTo(elements);
        List<PlannerBlock> blocks =
                Arrays.stream(PlannerBlockType.values())
                        .map(
                                type ->
                                        new PlannerBlock(
                                                type.name(),
                                                type,
                                                "Текст",
                                                type == PlannerBlockType.todo ? false : null))
                        .toList();
        planners.create(p.tutor.id(), "План", blocks);
        assertThat(planners.findByTutorId(p.tutor.id()).orElseThrow().blocks()).isEqualTo(blocks);
        Lesson lesson = lesson(p, Instant.parse("2027-10-01T00:00:00Z"));
        try (ExecutorService executor = Executors.newFixedThreadPool(2)) {
            var first = executor.submit(() -> attachments.attach(lesson.id(), board.id()));
            var second = executor.submit(() -> attachments.attach(lesson.id(), board.id()));
            assertThat(first.get(20, TimeUnit.SECONDS)).isEqualTo(second.get(20, TimeUnit.SECONDS));
        }
        assertThat(attachments.findByLessonId(lesson.id())).hasSize(1);
    }

    private static <T> List<T> collect(Function<PageRequest, CursorPage<T>> list, int limit) {
        List<T> result = new ArrayList<>();
        PageRequest request = PageRequest.first(limit);
        for (int i = 0; i < 20; i++) {
            CursorPage<T> page = list.apply(request);
            result.addAll(page.items());
            if (!page.hasMore()) return result;
            request = new PageRequest(limit, page.nextCursor().orElseThrow());
        }
        throw new AssertionError("pagination did not terminate");
    }

    private static void assertRace(Supplier<Mutation> write) throws Exception {
        try (ExecutorService executor = Executors.newFixedThreadPool(2)) {
            CountDownLatch ready = new CountDownLatch(2), start = new CountDownLatch(1);
            Callable<Mutation> operation =
                    () -> {
                        ready.countDown();
                        if (!start.await(10, TimeUnit.SECONDS))
                            throw new AssertionError("start timeout");
                        return write.get();
                    };
            Future<Mutation> first = executor.submit(operation),
                    second = executor.submit(operation);
            assertThat(ready.await(10, TimeUnit.SECONDS)).isTrue();
            start.countDown();
            assertThat(List.of(first.get(20, TimeUnit.SECONDS), second.get(20, TimeUnit.SECONDS)))
                    .containsExactlyInAnyOrder(UPDATED, CONFLICT);
        }
    }
}

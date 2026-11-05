package com.tandem.api.repo.jdbc;

import com.tandem.api.domain.model.LessonBoard;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.util.UUID;

/** Uses the caller's transaction and DataSource, including a surrounding JPA transaction. */
@Component
public class LessonBoardInsert {
    private final JdbcTemplate jdbc;

    public LessonBoardInsert(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public LessonBoard attach(UUID lessonId, UUID boardId) {
        jdbc.update(
                "insert into lesson_boards (lesson_id, board_id) values (?, ?) on conflict"
                        + " (lesson_id, board_id) do nothing",
                lessonId,
                boardId);
        return jdbc.queryForObject(
                "select attached_at from lesson_boards where lesson_id = ? and board_id = ?",
                (rs, index) -> new LessonBoard(lessonId, boardId, rs.getTimestamp(1).toInstant()),
                lessonId,
                boardId);
    }
}

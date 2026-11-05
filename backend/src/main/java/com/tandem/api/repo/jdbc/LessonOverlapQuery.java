package com.tandem.api.repo.jdbc;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.UUID;

@Component
public class LessonOverlapQuery {
    private final JdbcTemplate jdbc;

    public LessonOverlapQuery(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public boolean exists(UUID tutorId, Instant startsAt, short durationMinutes, UUID excludeId) {
        return Boolean.TRUE.equals(
                jdbc.queryForObject(
                        """
                        select exists(select 1 from lessons where tutor_id = ?
                            and status in ('scheduled', 'in_progress')
                            and starts_at < ? and starts_at + duration_minutes * interval '1 minute' > ?
                            and (?::uuid is null or id <> ?::uuid))
                        """,
                        Boolean.class,
                        tutorId,
                        Timestamp.from(startsAt.plusSeconds(durationMinutes * 60L)),
                        Timestamp.from(startsAt),
                        excludeId,
                        excludeId));
    }
}

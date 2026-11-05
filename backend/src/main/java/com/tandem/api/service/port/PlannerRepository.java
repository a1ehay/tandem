package com.tandem.api.service.port;

import com.tandem.api.domain.model.Planner;
import com.tandem.api.domain.model.PlannerBlock;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface PlannerRepository {
    Planner create(UUID tutorId, String title, List<PlannerBlock> blocks);

    Optional<Planner> findByTutorId(UUID tutorId);

    Mutation replace(
            UUID tutorId, Instant expectedUpdatedAt, String title, List<PlannerBlock> blocks);
}

package com.tandem.api.service.port;

import com.tandem.api.domain.model.User;
import com.tandem.api.domain.model.UserRole;

import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

public interface UserRepository {
    User create(String email, String displayName, UserRole role);

    Optional<User> findById(UUID id);

    Optional<User> findByEmail(String email);

    /** At most 100 IDs; absent users are omitted. Used to assemble student cards without N+1. */
    Map<UUID, User> findByIds(Set<UUID> ids);

    Mutation updateDisplayName(UUID id, String displayName);
}

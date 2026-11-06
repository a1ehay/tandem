package com.tandem.api.repo.jpa;

import static com.tandem.api.repo.jpa.PersistenceGuard.call;
import static com.tandem.api.service.port.Mutation.*;

import com.tandem.api.domain.model.User;
import com.tandem.api.domain.model.UserRole;
import com.tandem.api.repo.jpa.entity.UserEntity;
import com.tandem.api.service.port.Mutation;
import com.tandem.api.service.port.RepositoryArgumentException;
import com.tandem.api.service.port.UserRepository;

import jakarta.persistence.EntityManager;

import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

@Repository
@Transactional(readOnly = true)
public class JpaUserAdapter implements UserRepository {
    private final UserJpaRepository rows;
    private final EntityManager em;

    public JpaUserAdapter(UserJpaRepository rows, EntityManager em) {
        this.rows = rows;
        this.em = em;
    }

    @Override
    @Transactional
    public User create(String email, String displayName, UserRole role) {
        return call(
                () -> {
                    UserEntity e = new UserEntity();
                    e.id = UUID.randomUUID();
                    e.email = email;
                    e.displayName = displayName;
                    e.role = role;
                    em.persist(e);
                    em.flush();
                    em.refresh(e);
                    return EntityMapper.map(e);
                });
    }

    @Override
    public Optional<User> findById(UUID id) {
        return call(() -> rows.findById(id).map(EntityMapper::map));
    }

    @Override
    public Optional<User> findByEmail(String email) {
        return call(() -> rows.findByCaseInsensitiveEmail(email).map(EntityMapper::map));
    }

    @Override
    public Map<UUID, User> findByIds(Set<UUID> ids) {
        if (ids.size() > 100) throw new RepositoryArgumentException("at most 100 IDs per batch");
        if (ids.isEmpty()) return Map.of();
        return call(
                () ->
                        rows.findAllById(ids).stream()
                                .map(EntityMapper::map)
                                .collect(
                                        java.util.stream.Collectors.toUnmodifiableMap(
                                                User::id, e -> e)));
    }

    @Override
    @Transactional
    public Mutation updateDisplayName(UUID id, String displayName) {
        return call(
                () -> {
                    UserEntity e = LockedRows.find(em, UserEntity.class, id);
                    if (e == null) return NOT_FOUND;
                    e.displayName = displayName;
                    e.touch();
                    em.flush();
                    return UPDATED;
                });
    }
}

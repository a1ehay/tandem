package com.tandem.api.repo.jpa;

import com.tandem.api.repo.jpa.entity.UserEntity;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Optional;
import java.util.UUID;

interface UserJpaRepository extends JpaRepository<UserEntity, UUID> {
    // Bind as citext explicitly: ordinary VARCHAR comparison can lose citext semantics/index usage.
    @Query(
            value = "select u.* from users u where u.email = cast(:email as citext)",
            nativeQuery = true)
    Optional<UserEntity> findByCaseInsensitiveEmail(@Param("email") String email);
}

package com.tandem.api.repo.jpa.entity;

import com.tandem.api.domain.model.UserRole;

import jakarta.persistence.Column;
import jakarta.persistence.Convert;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.util.UUID;

@Entity
@Table(name = "users")
public class UserEntity extends TimedEntity {
    @Id
    @Column(name = "id")
    public UUID id;

    @Column(name = "email", columnDefinition = "citext")
    public String email;

    @Column(name = "display_name", columnDefinition = "text")
    public String displayName;

    @Column(name = "role", columnDefinition = "text")
    @Convert(converter = UserRoleConverter.class)
    public UserRole role;
}

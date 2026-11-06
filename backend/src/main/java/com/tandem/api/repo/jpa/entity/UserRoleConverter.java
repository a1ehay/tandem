package com.tandem.api.repo.jpa.entity;

import com.tandem.api.domain.model.UserRole;

import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;

import java.util.Locale;

@Converter
public class UserRoleConverter implements AttributeConverter<UserRole, String> {
    public String convertToDatabaseColumn(UserRole value) {
        return value == null ? null : value.name().toLowerCase(Locale.ROOT);
    }

    public UserRole convertToEntityAttribute(String value) {
        return value == null ? null : UserRole.valueOf(value.toUpperCase(Locale.ROOT));
    }
}

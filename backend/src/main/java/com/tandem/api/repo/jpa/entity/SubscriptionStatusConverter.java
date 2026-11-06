package com.tandem.api.repo.jpa.entity;

import com.tandem.api.domain.model.SubscriptionStatus;

import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;

import java.util.Locale;

@Converter
public class SubscriptionStatusConverter implements AttributeConverter<SubscriptionStatus, String> {
    public String convertToDatabaseColumn(SubscriptionStatus value) {
        return value == null ? null : value.name().toLowerCase(Locale.ROOT);
    }

    public SubscriptionStatus convertToEntityAttribute(String value) {
        return value == null ? null : SubscriptionStatus.valueOf(value.toUpperCase(Locale.ROOT));
    }
}

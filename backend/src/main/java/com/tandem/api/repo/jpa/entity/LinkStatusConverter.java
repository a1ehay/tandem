package com.tandem.api.repo.jpa.entity;

import com.tandem.api.domain.model.LinkStatus;

import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;

import java.util.Locale;

@Converter
public class LinkStatusConverter implements AttributeConverter<LinkStatus, String> {
    public String convertToDatabaseColumn(LinkStatus value) {
        return value == null ? null : value.name().toLowerCase(Locale.ROOT);
    }

    public LinkStatus convertToEntityAttribute(String value) {
        return value == null ? null : LinkStatus.valueOf(value.toUpperCase(Locale.ROOT));
    }
}

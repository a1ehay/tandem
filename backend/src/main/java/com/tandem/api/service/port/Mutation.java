package com.tandem.api.service.port;

/** Outcome of a conditional write; no storage or HTTP details escape the adapter. */
public enum Mutation {
    UPDATED,
    NOT_FOUND,
    CONFLICT
}

package com.tandem.api.repo.jpa;

import jakarta.persistence.EntityManager;
import jakarta.persistence.EntityNotFoundException;
import jakarta.persistence.LockModeType;

final class LockedRows {
    private LockedRows() {}

    static <T> T find(EntityManager em, Class<T> type, Object id) {
        em.flush();
        try {
            T entity = em.find(type, id, LockModeType.PESSIMISTIC_WRITE);
            // An outer service transaction may have read a now-stale instance earlier.
            // A row lock alone does not refresh the first-level persistence context.
            if (entity != null) em.refresh(entity, LockModeType.PESSIMISTIC_WRITE);
            return entity;
        } catch (EntityNotFoundException missing) {
            return null;
        }
    }
}

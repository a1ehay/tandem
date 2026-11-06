package com.tandem.api.repo.jpa;

import com.tandem.api.service.port.RepositoryArgumentException;
import com.tandem.api.service.port.StorageException;

import jakarta.persistence.EntityExistsException;
import jakarta.persistence.LockTimeoutException;
import jakarta.persistence.PersistenceException;
import jakarta.persistence.PessimisticLockException;

import org.springframework.dao.ConcurrencyFailureException;
import org.springframework.dao.DataAccessException;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.transaction.CannotCreateTransactionException;
import org.springframework.transaction.TransactionException;

import java.sql.SQLException;
import java.util.function.Supplier;

final class PersistenceGuard {
    private PersistenceGuard() {}

    static <T> T call(Supplier<T> operation) {
        try {
            return operation.get();
        } catch (RuntimeException failure) {
            throw translate(failure);
        }
    }

    static RuntimeException translate(RuntimeException failure) {
        if (failure instanceof StorageException) return failure;
        for (Throwable cause = failure; cause != null; cause = cause.getCause()) {
            if (cause instanceof RepositoryArgumentException invalid) return invalid;
        }
        if (!(failure instanceof PersistenceException
                || failure instanceof DataAccessException
                || failure instanceof TransactionException)) return failure;
        StorageException.Kind kind = StorageException.Kind.UNEXPECTED;
        if (failure instanceof EntityExistsException) kind = StorageException.Kind.UNIQUE;
        if (failure instanceof DataAccessResourceFailureException
                || failure instanceof CannotCreateTransactionException)
            kind = StorageException.Kind.UNAVAILABLE;
        if (failure instanceof ConcurrencyFailureException
                || failure instanceof LockTimeoutException
                || failure instanceof PessimisticLockException)
            kind = StorageException.Kind.CONFLICT;
        for (Throwable cause = failure; cause != null; cause = cause.getCause()) {
            if (cause instanceof SQLException sql && sql.getSQLState() != null) {
                String state = sql.getSQLState();
                kind =
                        switch (state) {
                            case "23505" -> StorageException.Kind.UNIQUE;
                            case "23503" -> StorageException.Kind.REFERENCE;
                            case "40001", "40P01", "55P03" -> StorageException.Kind.CONFLICT;
                            default ->
                                    state.startsWith("08")
                                            ? StorageException.Kind.UNAVAILABLE
                                            : state.startsWith("23") || state.startsWith("22")
                                                    ? StorageException.Kind.CONSTRAINT
                                                    : kind;
                        };
            }
        }
        return new StorageException(kind, failure);
    }
}

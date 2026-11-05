/**
 * Storage-independent application ports. Reads return Optional or an immutable page; conditional
 * writes return Mutation. StorageException distinguishes integrity, concurrency, and availability
 * failures. Nullable fields represent nullable V1 columns. Participant IDs scope queries;
 * application services remain responsible for authorization.
 */
package com.tandem.api.service.port;

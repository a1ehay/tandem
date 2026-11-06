package com.tandem.api.repo;

// CRUD - create read update delete
public interface RepositoryInterface {
    int createUser(int id, String name, String email);
    int readUser();
    int updateUser();
    int deleteUser();
}

-- One Postgres host, one database per service (service data isolation).
-- Runs once at first volume init.
CREATE DATABASE progressdb OWNER nexora;
CREATE DATABASE tutordb OWNER nexora;
-- authdb is created by POSTGRES_DB on first boot.

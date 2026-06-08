-- Migration: 001_init.sql
-- Creates the initial database schema for personal-task-manager

CREATE TABLE IF NOT EXISTS tasks (
  id           SERIAL PRIMARY KEY,
  title        VARCHAR(255) NOT NULL,
  description  TEXT,
  is_complete  BOOLEAN NOT NULL DEFAULT false,
  created_at   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_tasks_is_complete ON tasks (is_complete);
CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON tasks (created_at DESC);
ALTER TABLE tests ADD COLUMN time_limit_minutes INTEGER NOT NULL DEFAULT 0 CHECK(time_limit_minutes BETWEEN 0 AND 480);

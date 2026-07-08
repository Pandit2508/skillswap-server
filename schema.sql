-- SkillSwap Database Schema
-- PostgreSQL
--
-- This file documents the actual schema the application queries against
-- (reconstructed from controllers/routes). Run this against a fresh
-- database to bootstrap local development or a new deployment.

CREATE TABLE IF NOT EXISTS users (
    id             SERIAL PRIMARY KEY,
    name           VARCHAR(255) NOT NULL,
    email          VARCHAR(255) UNIQUE NOT NULL,
    password_hash  VARCHAR(255),                  -- NULL for Google OAuth accounts
    is_google      BOOLEAN DEFAULT FALSE,
    bio            TEXT,
    avatar_url     TEXT,
    location       VARCHAR(255),
    experience     VARCHAR(255),
    created_at     TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS skills (
    id    SERIAL PRIMARY KEY,
    name  VARCHAR(255) UNIQUE NOT NULL
);

-- Skills a user can teach
CREATE TABLE IF NOT EXISTS skill_offers (
    id             SERIAL PRIMARY KEY,
    user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    offered_skill  INTEGER NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
    UNIQUE (user_id, offered_skill)
);

-- Skills a user wants to learn
CREATE TABLE IF NOT EXISTS user_skills (
    id        SERIAL PRIMARY KEY,
    user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    skill_id  INTEGER NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
    UNIQUE (user_id, skill_id)
);

CREATE TABLE IF NOT EXISTS availability (
    id          SERIAL PRIMARY KEY,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    day         VARCHAR(20) NOT NULL,   -- e.g. 'monday'
    start_time  TIME NOT NULL,
    end_time    TIME NOT NULL,
    CHECK (start_time < end_time)
);

CREATE TABLE IF NOT EXISTS match_requests (
    id           SERIAL PRIMARY KEY,
    sender_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    receiver_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status       VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending | accepted | rejected
    created_at   TIMESTAMP NOT NULL DEFAULT NOW(),
    CHECK (sender_id <> receiver_id)
);

CREATE TABLE IF NOT EXISTS bookings (
    id            SERIAL PRIMARY KEY,
    user1_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    user2_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    session_time  TIMESTAMP NOT NULL,
    end_time      TIMESTAMP NOT NULL,
    meeting_link  TEXT NOT NULL,
    status        VARCHAR(20) NOT NULL DEFAULT 'scheduled', -- scheduled | completed | cancelled
    created_at    TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Post-session ratings. A review can only be left once per booking per
-- reviewer, and only after the session's end_time has passed (enforced
-- in application code, not here, since "now" isn't a static constraint).
CREATE TABLE IF NOT EXISTS reviews (
    id          SERIAL PRIMARY KEY,
    booking_id  INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
    reviewer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reviewee_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    rating      SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
    comment     TEXT,
    created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE (booking_id, reviewer_id),
    CHECK (reviewer_id <> reviewee_id)
);

-- Helpful indexes for the lookups the app actually performs
CREATE INDEX IF NOT EXISTS idx_skill_offers_user   ON skill_offers(user_id);
CREATE INDEX IF NOT EXISTS idx_user_skills_user     ON user_skills(user_id);
CREATE INDEX IF NOT EXISTS idx_availability_user    ON availability(user_id);
CREATE INDEX IF NOT EXISTS idx_match_requests_recv  ON match_requests(receiver_id, status);
CREATE INDEX IF NOT EXISTS idx_match_requests_send  ON match_requests(sender_id, status);
CREATE INDEX IF NOT EXISTS idx_bookings_user1       ON bookings(user1_id);
CREATE INDEX IF NOT EXISTS idx_bookings_user2       ON bookings(user2_id);
CREATE INDEX IF NOT EXISTS idx_reviews_reviewee     ON reviews(reviewee_id);
CREATE INDEX IF NOT EXISTS idx_reviews_booking      ON reviews(booking_id);

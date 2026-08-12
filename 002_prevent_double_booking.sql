-- Migration: prevent a user from being double-booked into overlapping sessions
--
-- Problem: bookings had no constraint stopping the same user from ending
-- up in two rows with overlapping [session_time, end_time) ranges. Two
-- match requests accepted near-simultaneously for the same user could
-- each pass an app-level "is this slot free?" check before either
-- INSERT committed (classic check-then-act race).
--
-- Design note: a naive fix (an exclusion constraint directly on
-- bookings.user1_id and a separate one on bookings.user2_id) is NOT
-- enough -- it only compares user1 against other user1 rows and user2
-- against other user2 rows, so it misses the case where the same person
-- is user1 in one booking and user2 in another. Instead, we normalize
-- into a booking_participants table with one row per person per
-- booking, and constrain overlap on that table, which is role-agnostic.

BEGIN;

CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE IF NOT EXISTS booking_participants (
    booking_id  INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    slot        tstzrange NOT NULL,
    PRIMARY KEY (booking_id, user_id)
);

-- The actual guarantee: Postgres rejects any new row whose user_id
-- matches an existing row AND whose slot overlaps ('&&') it -- no matter
-- how the two competing transactions are timed, one of them loses at
-- the database layer.
ALTER TABLE booking_participants
  ADD CONSTRAINT no_overlapping_bookings
  EXCLUDE USING gist (user_id WITH =, slot WITH &&);

CREATE INDEX IF NOT EXISTS idx_booking_participants_user
  ON booking_participants(user_id);

-- Backfill existing bookings into the new table (safe to re-run).
INSERT INTO booking_participants (booking_id, user_id, slot)
SELECT id, user1_id, tstzrange(session_time, end_time, '[)') FROM bookings
ON CONFLICT DO NOTHING;

INSERT INTO booking_participants (booking_id, user_id, slot)
SELECT id, user2_id, tstzrange(session_time, end_time, '[)') FROM bookings
ON CONFLICT DO NOTHING;

COMMIT;

-- Note: if you later add booking cancellation, either delete the
-- corresponding booking_participants rows on cancel, or switch to a
-- partial exclusion constraint (`WHERE status = 'scheduled'`, joined
-- back to bookings) so cancelled sessions stop blocking the slot.

ALTER TABLE profiles
    ADD COLUMN is_active INTEGER NOT NULL DEFAULT 0 CHECK (is_active IN (0, 1));

CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_single_active
    ON profiles(is_active)
    WHERE is_active = 1;

UPDATE profiles
SET is_active = 0;

UPDATE profiles
SET is_active = 1
WHERE id = 'profile_local_default';

UPDATE profiles
SET is_active = 1
WHERE is_active = 0
  AND id = (
      SELECT id
      FROM profiles
      ORDER BY created_at ASC, id ASC
      LIMIT 1
  );

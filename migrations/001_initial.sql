CREATE TABLE IF NOT EXISTS app_records (
  path text PRIMARY KEY,
  owner_id text NOT NULL,
  data jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS app_records_owner_path_idx ON app_records (owner_id, path);
CREATE INDEX IF NOT EXISTS app_records_updated_at_idx ON app_records (updated_at DESC);

CREATE TABLE IF NOT EXISTS school_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_name text NOT NULL,
  school_domain text NOT NULL,
  website text NOT NULL,
  address text NOT NULL,
  contact_name text NOT NULL,
  contact_email text NOT NULL,
  verification_details text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'declined')),
  reviewer_id text,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS schools (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  domain text NOT NULL,
  website text NOT NULL,
  address text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE school_applications
  ADD COLUMN IF NOT EXISTS school_id uuid REFERENCES schools(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS school_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  email text NOT NULL,
  role text NOT NULL CHECK (role IN ('school_admin', 'teacher', 'student')),
  permissions text[] NOT NULL DEFAULT ARRAY[]::text[],
  token_hash text NOT NULL UNIQUE,
  created_by text,
  expires_at timestamptz NOT NULL DEFAULT now() + interval '14 days',
  accepted_by text,
  accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS school_members (
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  user_id text NOT NULL,
  email text NOT NULL,
  display_name text NOT NULL,
  role text NOT NULL CHECK (role IN ('school_admin', 'teacher', 'student')),
  permissions text[] NOT NULL DEFAULT ARRAY[]::text[],
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (school_id, user_id),
  UNIQUE (user_id)
);

CREATE TABLE IF NOT EXISTS school_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  title text NOT NULL,
  subject text NOT NULL,
  instructions text NOT NULL,
  due_at timestamptz,
  attachment jsonb,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS assignment_teachers (
  assignment_id uuid NOT NULL REFERENCES school_assignments(id) ON DELETE CASCADE,
  user_id text NOT NULL,
  PRIMARY KEY (assignment_id, user_id)
);

CREATE TABLE IF NOT EXISTS assignment_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid NOT NULL REFERENCES school_assignments(id) ON DELETE CASCADE,
  student_id text NOT NULL,
  text_answer text NOT NULL DEFAULT '',
  attachment jsonb,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (assignment_id, student_id)
);

CREATE TABLE IF NOT EXISTS assignment_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL REFERENCES assignment_submissions(id) ON DELETE CASCADE,
  author_id text NOT NULL,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS school_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id text,
  recipient_email text,
  school_id uuid REFERENCES schools(id) ON DELETE CASCADE,
  kind text NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  target_id uuid,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS school_applications_status_idx ON school_applications (status, created_at DESC);
CREATE INDEX IF NOT EXISTS school_applications_contact_idx ON school_applications (contact_email, created_at DESC);
CREATE INDEX IF NOT EXISTS school_members_user_idx ON school_members (user_id, school_id);
CREATE INDEX IF NOT EXISTS school_assignments_school_idx ON school_assignments (school_id, created_at DESC);
CREATE INDEX IF NOT EXISTS school_notifications_recipient_idx ON school_notifications (recipient_id, created_at DESC);

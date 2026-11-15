-- ==============================================================================
-- VORTEX: Academic Operating System (Phase 3)
-- Batch 2: Student Core - PostgreSQL Database Schema & RLS Policies (Supabase)
-- ==============================================================================

-- 1. Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Students Table
-- Primary profile record linked 1:1 with Supabase Auth (auth.users)
CREATE TABLE IF NOT EXISTS public.students (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    avatar_url TEXT,
    university TEXT NOT NULL DEFAULT 'Vortex Institute of Technology',
    faculty TEXT NOT NULL,
    department TEXT NOT NULL,
    academic_year SMALLINT NOT NULL DEFAULT 1 CHECK (academic_year BETWEEN 1 AND 7),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 3. Courses Table
-- Course catalog managed by faculty / academic administration
CREATE TABLE IF NOT EXISTS public.courses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    code VARCHAR(20) NOT NULL UNIQUE,
    instructor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    description TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'upcoming', 'archived', 'completed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 4. Enrollments Table
-- Tracks student enrollment, completion progress percentage, and access timestamps
CREATE TABLE IF NOT EXISTS public.enrollments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
    course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
    progress_percentage NUMERIC(5, 2) NOT NULL DEFAULT 0.00 CHECK (progress_percentage >= 0.00 AND progress_percentage <= 100.00),
    enrolled_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    last_accessed_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
    UNIQUE(student_id, course_id)
);

-- 5. Activities Table
-- Event timeline stream for student audit logs, notifications, and recent activity
CREATE TABLE IF NOT EXISTS public.activities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
    type VARCHAR(30) NOT NULL CHECK (type IN ('quiz', 'assignment', 'review', 'grade', 'lecture', 'file')),
    description TEXT NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Performance Indexes
CREATE INDEX IF NOT EXISTS idx_students_email ON public.students(email);
CREATE INDEX IF NOT EXISTS idx_courses_code ON public.courses(code);
CREATE INDEX IF NOT EXISTS idx_courses_status ON public.courses(status);
CREATE INDEX IF NOT EXISTS idx_enrollments_student ON public.enrollments(student_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_course ON public.enrollments(course_id);
CREATE INDEX IF NOT EXISTS idx_activities_student_time ON public.activities(student_id, created_at DESC);

-- Automatic Timestamp Update Trigger
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_students_updated
    BEFORE UPDATE ON public.students
    FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();

CREATE TRIGGER on_courses_updated
    BEFORE UPDATE ON public.courses
    FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();

-- ==============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ==============================================================================

-- Enable RLS across all tables
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;

-- 1. Students Policies
-- A student can view their own profile
CREATE POLICY "Students can view own profile"
    ON public.students
    FOR SELECT
    USING (auth.uid() = id);

-- A student can insert their own profile upon signup
CREATE POLICY "Students can insert own profile"
    ON public.students
    FOR INSERT
    WITH CHECK (auth.uid() = id);

-- A student can update their own profile
CREATE POLICY "Students can update own profile"
    ON public.students
    FOR UPDATE
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

-- 2. Courses Policies
-- Authenticated users (students & staff) can view all active and upcoming courses
CREATE POLICY "Authenticated users can view active courses"
    ON public.courses
    FOR SELECT
    TO authenticated
    USING (status IN ('active', 'upcoming'));

-- 3. Enrollments Policies
-- Students can view their own course enrollments and progress
CREATE POLICY "Students can view their own enrollments"
    ON public.enrollments
    FOR SELECT
    USING (auth.uid() = student_id);

-- Students can self-enroll into courses
CREATE POLICY "Students can enroll in courses"
    ON public.enrollments
    FOR INSERT
    WITH CHECK (auth.uid() = student_id);

-- Students can update their own enrollment progress
CREATE POLICY "Students can update their own progress"
    ON public.enrollments
    FOR UPDATE
    USING (auth.uid() = student_id)
    WITH CHECK (auth.uid() = student_id);

-- 4. Activities Policies
-- Students can only view their own activity timeline
CREATE POLICY "Students can view their own activities"
    ON public.activities
    FOR SELECT
    USING (auth.uid() = student_id);

-- System and student triggers can log activities for themselves
CREATE POLICY "Students can insert their own activities"
    ON public.activities
    FOR INSERT
    WITH CHECK (auth.uid() = student_id);

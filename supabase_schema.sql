-- ==============================================================================
-- SUPABASE POSTGRESQL SCHEMA MIGRATION FOR PPIC EXPERIMENTAL PROJECT (AKUN B)
-- High-Volume Architecture (~20,000 - 600,000+ rows/month)
-- Append-only upload history, indexed Style & OR search, idempotent batch inserts
-- Conforms strictly to Master Specification Sections 4 & 5
-- ==============================================================================

-- 0. Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==============================================================================
-- 1. TABLE A: UPLOAD HISTORY (Histori setiap proses upload)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS upload_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    upload_id UUID UNIQUE NOT NULL,
    or_number TEXT NOT NULL,
    style TEXT NOT NULL,
    update_date DATE NOT NULL,
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    total_rows INTEGER NOT NULL DEFAULT 0,
    successful_rows INTEGER NOT NULL DEFAULT 0,
    failed_rows INTEGER NOT NULL DEFAULT 0,
    upload_status TEXT NOT NULL DEFAULT 'completed', -- 'pending', 'processing', 'partial_failure', 'completed', 'failed'
    checkpoint_batch INTEGER NOT NULL DEFAULT 0,
    file_name TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Idempotent column additions in case table was pre-created
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='upload_history' AND column_name='upload_id') THEN
        ALTER TABLE upload_history ADD COLUMN upload_id UUID;
        UPDATE upload_history SET upload_id = id WHERE upload_id IS NULL;
        ALTER TABLE upload_history ALTER COLUMN upload_id SET NOT NULL;
        ALTER TABLE upload_history ADD CONSTRAINT upload_history_upload_id_key UNIQUE (upload_id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='upload_history' AND column_name='uploaded_at') THEN
        ALTER TABLE upload_history ADD COLUMN uploaded_at TIMESTAMPTZ DEFAULT NOW();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='upload_history' AND column_name='successful_rows') THEN
        ALTER TABLE upload_history ADD COLUMN successful_rows INTEGER DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='upload_history' AND column_name='upload_status') THEN
        ALTER TABLE upload_history ADD COLUMN upload_status TEXT DEFAULT 'completed';
    END IF;
END $$;

-- Indexes for Upload History
CREATE INDEX IF NOT EXISTS idx_upload_history_uploaded_at ON upload_history(uploaded_at DESC);
CREATE INDEX IF NOT EXISTS idx_upload_history_upload_id ON upload_history(upload_id);
CREATE INDEX IF NOT EXISTS idx_upload_history_or_number ON upload_history(or_number);
CREATE INDEX IF NOT EXISTS idx_upload_history_style ON upload_history(style);
CREATE INDEX IF NOT EXISTS idx_upload_history_or_style ON upload_history(or_number, style);
CREATE INDEX IF NOT EXISTS idx_upload_history_status ON upload_history(upload_status);

-- ==============================================================================
-- 2. TABLE B: MATERIAL REQUIREMENTS (Detail material setiap upload - Append Only)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS material_requirements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    upload_id UUID NOT NULL REFERENCES upload_history(upload_id) ON DELETE CASCADE,
    or_number TEXT NOT NULL,
    style TEXT NOT NULL,
    update_date DATE NOT NULL,
    material_code TEXT NOT NULL, -- TEXT ensures preservation of leading zeros (e.g. '00123') and special characters
    material_name TEXT NOT NULL,
    requirement NUMERIC(15, 4) NOT NULL DEFAULT 0,
    received NUMERIC(15, 4) NOT NULL DEFAULT 0,
    -- Rumus Baku PPIC: shortage = received - requirement
    shortage NUMERIC(15, 4) NOT NULL,
    unit TEXT NOT NULL DEFAULT 'PCS',
    -- Status Kesiapan Baku: shortage >= 0 => 'READY', shortage < 0 => 'BELUM READY'
    readiness_status TEXT NOT NULL CHECK (readiness_status IN ('READY', 'BELUM READY')),
    raw_display_name TEXT,
    is_flagged_for_review BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Idempotent column check/migrations for legacy variants
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='material_requirements' AND column_name='requirement') THEN
        ALTER TABLE material_requirements ADD COLUMN requirement NUMERIC(15, 4) DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='material_requirements' AND column_name='received') THEN
        ALTER TABLE material_requirements ADD COLUMN received NUMERIC(15, 4) DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='material_requirements' AND column_name='shortage') THEN
        ALTER TABLE material_requirements ADD COLUMN shortage NUMERIC(15, 4) DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='material_requirements' AND column_name='unit') THEN
        ALTER TABLE material_requirements ADD COLUMN unit TEXT DEFAULT 'PCS';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='material_requirements' AND column_name='readiness_status') THEN
        ALTER TABLE material_requirements ADD COLUMN readiness_status TEXT DEFAULT 'READY';
    END IF;
END $$;

-- High-performance B-Tree Indexes for Volume (20,000 to 600,000+ rows)
CREATE INDEX IF NOT EXISTS idx_mat_req_upload_id ON material_requirements(upload_id);
CREATE INDEX IF NOT EXISTS idx_mat_req_style ON material_requirements(style);
CREATE INDEX IF NOT EXISTS idx_mat_req_style_lower ON material_requirements(LOWER(style));
CREATE INDEX IF NOT EXISTS idx_mat_req_or_number ON material_requirements(or_number);
CREATE INDEX IF NOT EXISTS idx_mat_req_or_lower ON material_requirements(LOWER(or_number));
CREATE INDEX IF NOT EXISTS idx_mat_req_matcode ON material_requirements(material_code);
CREATE INDEX IF NOT EXISTS idx_mat_req_matname_lower ON material_requirements(LOWER(material_name));
CREATE INDEX IF NOT EXISTS idx_mat_req_update_date ON material_requirements(update_date DESC);
CREATE INDEX IF NOT EXISTS idx_mat_req_readiness ON material_requirements(readiness_status);
CREATE INDEX IF NOT EXISTS idx_mat_req_created_at ON material_requirements(created_at DESC);

-- ==============================================================================
-- 3. TABLE C: OR_STYLE_RELATIONS (Relasi OR dan Style untuk Autocomplete)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS or_style_relations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    or_number TEXT NOT NULL,
    style TEXT NOT NULL,
    latest_update_date DATE,
    upload_count INTEGER NOT NULL DEFAULT 1,
    last_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_or_style_or ON or_style_relations(or_number);
CREATE INDEX IF NOT EXISTS idx_or_style_style ON or_style_relations(style);
CREATE INDEX IF NOT EXISTS idx_or_style_pair ON or_style_relations(or_number, style);

-- ==============================================================================
-- 4. TABLE D: MASTER_MATERIALS (Referensi katalog material)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS master_materials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    material_code TEXT NOT NULL UNIQUE,
    material_name TEXT NOT NULL,
    unit TEXT NOT NULL DEFAULT 'PCS',
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_master_materials_code ON master_materials(material_code);

-- ==============================================================================
-- 5. TABLE E: PRODUCTION_SCHEDULES (Jadwal produksi & target)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS production_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    or_number TEXT NOT NULL,
    style TEXT NOT NULL,
    production_start DATE NOT NULL,
    production_end DATE NOT NULL,
    production_line TEXT NOT NULL,
    target_production NUMERIC NOT NULL DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Idempotent column check/migrations for legacy column aliases
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='production_schedules' AND column_name='production_start') THEN
        ALTER TABLE production_schedules ADD COLUMN production_start DATE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='production_schedules' AND column_name='production_end') THEN
        ALTER TABLE production_schedules ADD COLUMN production_end DATE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='production_schedules' AND column_name='production_line') THEN
        ALTER TABLE production_schedules ADD COLUMN production_line TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='production_schedules' AND column_name='target_production') THEN
        ALTER TABLE production_schedules ADD COLUMN target_production NUMERIC DEFAULT 0;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_prod_sched_style ON production_schedules(style);
CREATE INDEX IF NOT EXISTS idx_prod_sched_or ON production_schedules(or_number);
CREATE INDEX IF NOT EXISTS idx_prod_sched_dates ON production_schedules(production_start, production_end);
CREATE INDEX IF NOT EXISTS idx_prod_sched_line ON production_schedules(production_line);

-- ==============================================================================
-- 6. TABLE F: DELETION_HISTORY (Audit Trail Penghapusan & Rolling 4 Hari)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS deletion_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    action_type TEXT NOT NULL, -- 'ROLLING_4_DAYS_PURGE', 'MANUAL_OR_PURGE', 'SELECTIVE_DELETE'
    records_affected INTEGER NOT NULL,
    details TEXT,
    confirmed_by TEXT NOT NULL DEFAULT 'PPIC Operator',
    deleted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_deletion_history_time ON deletion_history(deleted_at DESC);
CREATE INDEX IF NOT EXISTS idx_deletion_history_action ON deletion_history(action_type);

-- ==============================================================================
-- 7. ROW LEVEL SECURITY (RLS) POLICIES
-- NOTE: Never use open RLS `USING (true) WITH CHECK (true)` for public roles.
-- The backend API communicates securely via SUPABASE_SERVICE_ROLE_KEY.
-- ==============================================================================
ALTER TABLE upload_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE material_requirements ENABLE ROW LEVEL SECURITY;
ALTER TABLE or_style_relations ENABLE ROW LEVEL SECURITY;
ALTER TABLE master_materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE production_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE deletion_history ENABLE ROW LEVEL SECURITY;

-- Grant exclusive service_role privileges (backend only, never exposed to browser)
DO $$
BEGIN
    DROP POLICY IF EXISTS "Allow service role full access" ON upload_history;
    CREATE POLICY "Allow service role full access" ON upload_history FOR ALL TO service_role USING (true) WITH CHECK (true);

    DROP POLICY IF EXISTS "Allow service role full access" ON material_requirements;
    CREATE POLICY "Allow service role full access" ON material_requirements FOR ALL TO service_role USING (true) WITH CHECK (true);

    DROP POLICY IF EXISTS "Allow service role full access" ON or_style_relations;
    CREATE POLICY "Allow service role full access" ON or_style_relations FOR ALL TO service_role USING (true) WITH CHECK (true);

    DROP POLICY IF EXISTS "Allow service role full access" ON master_materials;
    CREATE POLICY "Allow service role full access" ON master_materials FOR ALL TO service_role USING (true) WITH CHECK (true);

    DROP POLICY IF EXISTS "Allow service role full access" ON production_schedules;
    CREATE POLICY "Allow service role full access" ON production_schedules FOR ALL TO service_role USING (true) WITH CHECK (true);

    DROP POLICY IF EXISTS "Allow service role full access" ON deletion_history;
    CREATE POLICY "Allow service role full access" ON deletion_history FOR ALL TO service_role USING (true) WITH CHECK (true);
END $$;

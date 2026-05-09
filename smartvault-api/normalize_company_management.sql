ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS storage_quota_gb INTEGER DEFAULT 5;

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS type VARCHAR(50) DEFAULT 'Independent';

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS parent_company_id INTEGER REFERENCES companies(id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'idx_companies_name_unique'
  ) THEN
    CREATE UNIQUE INDEX idx_companies_name_unique ON companies ((LOWER(name)));
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'financial_years_company_name_unique'
  ) THEN
    ALTER TABLE financial_years
      ADD CONSTRAINT financial_years_company_name_unique UNIQUE (company_id, name);
  END IF;
END$$;

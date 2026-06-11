DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'vaultadmin') THEN
    CREATE USER vaultadmin WITH ENCRYPTED PASSWORD 'sanyasi@1981';
  ELSE
    ALTER USER vaultadmin WITH PASSWORD 'sanyasi@1981';
  END IF;
END $$;
SELECT 'CREATE DATABASE smartvault_db OWNER vaultadmin' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'smartvault_db')\gexec

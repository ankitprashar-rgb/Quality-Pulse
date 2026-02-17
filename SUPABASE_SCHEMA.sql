-- Quality Pulse Supabase Schema
-- This schema mirrors the Google Sheets "Rejection Log" structure

-- Create rejection_log table
CREATE TABLE IF NOT EXISTS rejection_log (
  id BIGSERIAL PRIMARY KEY,
  date DATE NOT NULL,
  client_name TEXT NOT NULL,
  vertical TEXT,
  project_name TEXT NOT NULL,
  product TEXT NOT NULL,
  print_media TEXT,
  lamination TEXT,
  printer_model TEXT,
  size TEXT,
  master_qty NUMERIC DEFAULT 0,
  batch_qty NUMERIC DEFAULT 0,
  design_rej NUMERIC DEFAULT 0,
  print_rej NUMERIC DEFAULT 0,
  lam_rej NUMERIC DEFAULT 0,
  cut_rej NUMERIC DEFAULT 0,
  pack_rej NUMERIC DEFAULT 0,
  media_rej NUMERIC DEFAULT 0,
  qty_rejected NUMERIC DEFAULT 0,
  qty_delivered NUMERIC DEFAULT 0,
  rejection_percent NUMERIC DEFAULT 0,
  in_stock NUMERIC DEFAULT 0,
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for faster queries
CREATE INDEX idx_rejection_log_date ON rejection_log(date DESC);
CREATE INDEX idx_rejection_log_client ON rejection_log(client_name);
CREATE INDEX idx_rejection_log_project ON rejection_log(project_name);
CREATE INDEX idx_rejection_log_vertical ON rejection_log(vertical);

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_rejection_log_updated_at
BEFORE UPDATE ON rejection_log
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- Enable Row Level Security (RLS)
ALTER TABLE rejection_log ENABLE ROW LEVEL SECURITY;

-- Create policy to allow all operations (adjust based on your auth requirements)
CREATE POLICY "Enable all access for authenticated users" ON rejection_log
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Optional: Create view for quick metrics
CREATE OR REPLACE VIEW rejection_metrics AS
SELECT
  date,
  vertical,
  COUNT(*) as total_entries,
  SUM(batch_qty) as total_batch,
  SUM(qty_rejected) as total_rejected,
  CASE 
    WHEN SUM(batch_qty) > 0 THEN (SUM(qty_rejected) / SUM(batch_qty) * 100)
    ELSE 0 
  END as overall_rejection_rate
FROM rejection_log
GROUP BY date, vertical
ORDER BY date DESC;

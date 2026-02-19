-- Enable RLS on the table (good practice, though might already be on)
ALTER TABLE rejection_log ENABLE ROW LEVEL SECURITY;

-- Policy to allow anonymous inserts (since we use anon key from client)
CREATE POLICY "Allow anon insert"
ON rejection_log
FOR INSERT
TO anon
WITH CHECK (true);

-- Policy to allow anonymous selects (to see history)
CREATE POLICY "Allow anon select"
ON rejection_log
FOR SELECT
TO anon
USING (true);

-- Debug: Check if policies exist
SELECT * FROM pg_policies WHERE tablename = 'rejection_log';

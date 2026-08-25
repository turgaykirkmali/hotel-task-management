ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE stock_transactions ADD COLUMN IF NOT EXISTS transaction_unit TEXT;

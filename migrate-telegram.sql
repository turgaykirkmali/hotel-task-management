-- Telegram kullanıcı adı alanını ekle
ALTER TABLE users ADD COLUMN IF NOT EXISTS telegram_username TEXT;

-- WhatsApp alanını kaldır (opsiyonel, eğer WhatsApp kullanıcı adı kaldırılacaksa)
-- ALTER TABLE users DROP COLUMN IF EXISTS whatsapp_number;
/*
# Migration: Messaging schema and optional contact name

1. Contacts Table Updates
- Alter `contacts.name` to be nullable with default ''
  Allow contacts to exist with ONLY a WhatsApp number.

2. New Tables
- `campaigns`: records broadcast message campaigns.
  - id (uuid, primary key)
  - user_id (uuid, FK auth.users)
  - message (text)
  - media_url (text, nullable)
  - media_type (text, nullable: 'image' | 'video')
  - created_at (timestamptz)

- `campaign_recipients`: records individual message deliveries per campaign.
  - id (uuid, primary key)
  - campaign_id (uuid, FK campaigns ON DELETE CASCADE)
  - contact_id (uuid, FK contacts ON DELETE SET NULL)
  - contact_name (text, nullable)
  - whatsapp_number (text, not null)
  - status (text: 'pending' | 'sent' | 'delivered' | 'read' | 'failed')
  - whatsapp_message_id (text, nullable)
  - error_message (text, nullable)
  - sent_at (timestamptz, nullable)
  - delivered_at (timestamptz, nullable)
  - read_at (timestamptz, nullable)
  - created_at (timestamptz)

- `whatsapp_settings`: official WhatsApp Business Platform configuration.
  - id (uuid, primary key)
  - user_id (uuid, FK auth.users)
  - waba_id (text, nullable)
  - phone_number_id (text, nullable)
  - display_phone_number (text, nullable)
  - access_token (text, nullable)
  - webhook_verify_token (text, nullable)
  - is_connected (boolean)
  - updated_at (timestamptz)

3. Security
- Enable RLS on all tables with authenticated owner-scoped policies.
- Preserves all existing contacts and tables intact.
*/

-- 1. Make name optional in contacts table
ALTER TABLE contacts ALTER COLUMN name DROP NOT NULL;
ALTER TABLE contacts ALTER COLUMN name SET DEFAULT '';

-- 2. Create campaigns table
CREATE TABLE IF NOT EXISTS campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  message text NOT NULL,
  media_url text,
  media_type text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS campaigns_user_id_idx ON campaigns (user_id);
CREATE INDEX IF NOT EXISTS campaigns_created_at_idx ON campaigns (created_at DESC);

ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_campaigns" ON campaigns;
CREATE POLICY "select_own_campaigns" ON campaigns FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_campaigns" ON campaigns;
CREATE POLICY "insert_own_campaigns" ON campaigns FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_campaigns" ON campaigns;
CREATE POLICY "update_own_campaigns" ON campaigns FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_campaigns" ON campaigns;
CREATE POLICY "delete_own_campaigns" ON campaigns FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- 3. Create campaign_recipients table
CREATE TABLE IF NOT EXISTS campaign_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES contacts(id) ON DELETE SET NULL,
  contact_name text,
  whatsapp_number text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  whatsapp_message_id text,
  error_message text,
  sent_at timestamptz,
  delivered_at timestamptz,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS campaign_recipients_campaign_id_idx ON campaign_recipients (campaign_id);
CREATE INDEX IF NOT EXISTS campaign_recipients_status_idx ON campaign_recipients (status);

ALTER TABLE campaign_recipients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_campaign_recipients" ON campaign_recipients;
CREATE POLICY "select_own_campaign_recipients" ON campaign_recipients FOR SELECT
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM campaigns
      WHERE campaigns.id = campaign_recipients.campaign_id
      AND campaigns.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "insert_own_campaign_recipients" ON campaign_recipients;
CREATE POLICY "insert_own_campaign_recipients" ON campaign_recipients FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM campaigns
      WHERE campaigns.id = campaign_recipients.campaign_id
      AND campaigns.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "update_own_campaign_recipients" ON campaign_recipients;
CREATE POLICY "update_own_campaign_recipients" ON campaign_recipients FOR UPDATE
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM campaigns
      WHERE campaigns.id = campaign_recipients.campaign_id
      AND campaigns.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "delete_own_campaign_recipients" ON campaign_recipients;
CREATE POLICY "delete_own_campaign_recipients" ON campaign_recipients FOR DELETE
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM campaigns
      WHERE campaigns.id = campaign_recipients.campaign_id
      AND campaigns.user_id = auth.uid()
    )
  );

-- 4. Create whatsapp_settings table
CREATE TABLE IF NOT EXISTS whatsapp_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  waba_id text,
  phone_number_id text,
  display_phone_number text,
  access_token text,
  webhook_verify_token text,
  is_connected boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE whatsapp_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_whatsapp_settings" ON whatsapp_settings;
CREATE POLICY "select_own_whatsapp_settings" ON whatsapp_settings FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_whatsapp_settings" ON whatsapp_settings;
CREATE POLICY "insert_own_whatsapp_settings" ON whatsapp_settings FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_whatsapp_settings" ON whatsapp_settings;
CREATE POLICY "update_own_whatsapp_settings" ON whatsapp_settings FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

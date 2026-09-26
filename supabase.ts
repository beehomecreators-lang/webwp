import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});

export type Contact = {
  id: string;
  user_id: string;
  name: string | null;
  whatsapp_number: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type Activity = {
  id: string;
  user_id: string;
  type: string;
  description: string;
  created_at: string;
};

export type Campaign = {
  id: string;
  user_id: string;
  message: string;
  media_url: string | null;
  media_type: 'image' | 'video' | null;
  created_at: string;
};

export type CampaignRecipient = {
  id: string;
  campaign_id: string;
  contact_id: string | null;
  contact_name: string | null;
  whatsapp_number: string;
  status: 'pending' | 'sent' | 'delivered' | 'read' | 'failed';
  whatsapp_message_id: string | null;
  error_message: string | null;
  sent_at: string | null;
  delivered_at: string | null;
  read_at: string | null;
  created_at: string;
};

export type SalaryCalculationMethod = 'calendar_days' | 'fixed_30' | 'working_days';

export type Employee = {
  id: string;
  user_id: string;
  name: string;
  monthly_salary: number | null;
  salary_calculation_method: SalaryCalculationMethod;
  created_at: string;
  updated_at: string;
};

export type AttendanceStatus = {
  id: string;
  user_id: string;
  label: string;
  short_code: string;
  attendance_value: number;
  color: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type AttendanceRecord = {
  id: string;
  user_id: string;
  employee_id: string;
  date: string; // YYYY-MM-DD — day-wise only, no time component
  status_id: string | null;
  created_at: string;
  updated_at: string;
};

export type WhatsAppSettings = {
  id?: string;
  user_id?: string;
  waba_id: string | null;
  phone_number_id: string | null;
  display_phone_number: string | null;
  access_token: string | null;
  webhook_verify_token: string | null;
  is_connected: boolean;
  updated_at?: string;
};

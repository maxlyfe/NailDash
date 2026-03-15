// ============================================
// NailDash Database Types — Multi-tenant
// ============================================

export type DayHours = { open: string; close: string } | null;
export type BusinessHours = Record<string, DayHours>; // "0"-"6" (Sun-Sat)

export type Salon = {
  id: string;
  owner_id: string;
  name: string;
  slug: string | null;
  phone: string | null;
  address: string | null;
  logo_url: string | null;
  timezone: string;
  currency: string;
  business_hours: BusinessHours | null;
  created_at: string;
  updated_at: string;
};

export type SalonMember = {
  id: string;
  salon_id: string;
  user_id: string;
  role: 'owner' | 'admin' | 'member';
  created_at: string;
};

export type Professional = {
  id: string;
  salon_id: string;
  user_id: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  role: 'nail_tech' | 'admin' | 'receptionist';
  avatar_url: string | null;
  is_active: boolean;
  commission_percent: number;
  created_at: string;
  updated_at: string;
};

export type Client = {
  id: string;
  salon_id: string;
  name: string;
  phone: string | null;
  email: string | null;
  notes: string | null;
  loyalty_points: number;
  total_spent: number;
  visit_count: number;
  last_visit_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ServiceCategory = {
  id: string;
  salon_id: string;
  name: string;
  sort_order: number;
  created_at: string;
};

export type Service = {
  id: string;
  salon_id: string;
  category_id: string | null;
  name: string;
  description: string | null;
  price: number;
  duration_minutes: number;
  is_addon: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  category?: ServiceCategory;
};

export type AppointmentStatus =
  | 'scheduled' | 'confirmed' | 'in_progress'
  | 'completed' | 'cancelled' | 'no_show';

export type Appointment = {
  id: string;
  salon_id: string;
  client_id: string | null;
  client_name: string | null;
  professional_id: string;
  status: AppointmentStatus;
  starts_at: string;
  ends_at: string;
  notes: string | null;
  payment_method: string | null;
  discount: number;
  extras: number;
  extras_description: string | null;
  advance_amount: number;
  advance_payment_method: string | null;
  advance_paid_at: string | null;
  total_amount: number;
  closed_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  client?: Client;
  professional?: Professional;
  appointment_services?: AppointmentService[];
};

export type AppointmentService = {
  id: string;
  appointment_id: string;
  service_id: string;
  price: number;
  duration_minutes: number;
  created_at: string;
  service?: Service;
};

export type TransactionType = 'sale' | 'expense';

export type Transaction = {
  id: string;
  salon_id: string;
  type: TransactionType;
  appointment_id: string | null;
  client_id: string | null;
  professional_id: string | null;
  description: string | null;
  total_amount: number;
  service_price: number;
  discount: number;
  tax: number;
  tips: number;
  payment_card: number;
  payment_cash: number;
  payment_transfer: number;
  payment_pix: number;
  payment_loyalty: number;
  payment_voucher: number;
  payment_package: number;
  transaction_date: string;
  registered_at: string;
  created_at: string;
  updated_at: string;
  client?: Client;
  professional?: Professional;
};

export type ExpenseCategory = {
  id: string;
  salon_id: string;
  name: string;
  is_recurring: boolean;
  created_at: string;
};

export type ImportLog = {
  id: string;
  salon_id: string;
  file_name: string;
  import_type: 'sales_log' | 'sales_summary' | 'expense_log' | 'expense_summary';
  row_count: number | null;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  error_log: string | null;
  imported_by: string | null;
  created_at: string;
};
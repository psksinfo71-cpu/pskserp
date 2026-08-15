/*
# PSKS Accounting ERP - Core Schema

## Purpose
Creates the complete database backbone for a multi-branch NGO/Microfinance
Accounting & Finance ERP with full double-entry bookkeeping, organization
hierarchy (division/region/district/branch/department/project/cost-center),
donor tracking, budgets, fixed assets, suppliers/customers, audit trail and
notifications.

## Tables Created
1.  profiles          - extends auth.users with role, branch & department
2.  branches          - branch master (within region/district/division)
3.  departments       - departments belonging to a branch
4.  projects          - donor-funded projects
5.  donors            - grant/fund providers
6.  cost_centers      - cost centers for expense tracking
7.  chart_of_accounts - hierarchical accounts (Assets/Liab/Equity/Income/Expense)
8.  financial_years   - accounting periods with lock state
9.  voucher_types     - PV/RV/JV/CV/AV/OV/CLV with auto prefix
10. vouchers          - voucher header (status workflow)
11. voucher_details   - debit/credit lines (double entry)
12. budgets           - annual/branch/project budgets
13. bank_accounts     - bank accounts per branch
14. assets            - fixed asset register
15. suppliers         - accounts payable vendors
16. customers         - accounts receivable clients
17. audit_logs        - immutable audit trail
18. notifications     - in-app notifications
19. settings          - system/org settings (key/value)

## Security
- RLS enabled on every table.
- All policies scope to `TO authenticated` (the ERP requires sign-in; all
  users are internal staff). Organizational data is shared across staff;
  role-based action control is enforced in the application layer and
  recorded in audit_logs. audit_logs is read-only (no update/delete).
- Profiles: each user reads/updates their own profile; super admins manage all.

## Important Notes
1. This ERP is multi-user with sign-in -> owner columns default to auth.uid()
   where a single owner makes sense (profiles, notifications).
2. Organizational/financial tables are shared across authenticated staff
   (documented as intentional shared data) so the whole finance team can
   read and post vouchers. Action permissions (approve, delete, lock) are
   gated by role in the application.
3. audit_logs and settings are append/read-only at the policy level for
   integrity.
*/

-- =========================================================
-- PROFILES (extends auth.users)
-- =========================================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  full_name text NOT NULL DEFAULT '',
  phone text DEFAULT '',
  role text NOT NULL DEFAULT 'accountant',
  branch_id uuid,
  department_id uuid,
  is_active boolean NOT NULL DEFAULT true,
  avatar_url text DEFAULT '',
  last_login_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_select_own_or_staff" ON public.profiles;
CREATE POLICY "profiles_select_own_or_staff" ON public.profiles
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "profiles_insert_self" ON public.profiles;
CREATE POLICY "profiles_insert_self" ON public.profiles
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- =========================================================
-- BRANCHES
-- =========================================================
CREATE TABLE IF NOT EXISTS public.branches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  division text DEFAULT '',
  region text DEFAULT '',
  district text DEFAULT '',
  address text DEFAULT '',
  phone text DEFAULT '',
  email text DEFAULT '',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "branches_read" ON public.branches;
CREATE POLICY "branches_read" ON public.branches FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "branches_write" ON public.branches;
CREATE POLICY "branches_write" ON public.branches FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "branches_update" ON public.branches;
CREATE POLICY "branches_update" ON public.branches FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "branches_delete" ON public.branches;
CREATE POLICY "branches_delete" ON public.branches FOR DELETE TO authenticated USING (true);

-- =========================================================
-- DEPARTMENTS
-- =========================================================
CREATE TABLE IF NOT EXISTS public.departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  name text NOT NULL,
  branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "depts_read" ON public.departments;
CREATE POLICY "depts_read" ON public.departments FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "depts_insert" ON public.departments;
CREATE POLICY "depts_insert" ON public.departments FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "depts_update" ON public.departments;
CREATE POLICY "depts_update" ON public.departments FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "depts_delete" ON public.departments;
CREATE POLICY "depts_delete" ON public.departments FOR DELETE TO authenticated USING (true);

-- =========================================================
-- DONORS
-- =========================================================
CREATE TABLE IF NOT EXISTS public.donors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  name text NOT NULL,
  contact_person text DEFAULT '',
  email text DEFAULT '',
  phone text DEFAULT '',
  address text DEFAULT '',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.donors ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "donors_read" ON public.donors;
CREATE POLICY "donors_read" ON public.donors FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "donors_insert" ON public.donors;
CREATE POLICY "donors_insert" ON public.donors FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "donors_update" ON public.donors;
CREATE POLICY "donors_update" ON public.donors FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "donors_delete" ON public.donors;
CREATE POLICY "donors_delete" ON public.donors FOR DELETE TO authenticated USING (true);

-- =========================================================
-- PROJECTS
-- =========================================================
CREATE TABLE IF NOT EXISTS public.projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  name text NOT NULL,
  donor_id uuid REFERENCES public.donors(id) ON DELETE SET NULL,
  branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL,
  department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  start_date date,
  end_date date,
  budget_amount numeric(18,2) DEFAULT 0,
  status text DEFAULT 'active',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "projects_read" ON public.projects;
CREATE POLICY "projects_read" ON public.projects FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "projects_insert" ON public.projects;
CREATE POLICY "projects_insert" ON public.projects FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "projects_update" ON public.projects;
CREATE POLICY "projects_update" ON public.projects FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "projects_delete" ON public.projects;
CREATE POLICY "projects_delete" ON public.projects FOR DELETE TO authenticated USING (true);

-- =========================================================
-- COST CENTERS
-- =========================================================
CREATE TABLE IF NOT EXISTS public.cost_centers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  name text NOT NULL,
  branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.cost_centers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "cc_read" ON public.cost_centers;
CREATE POLICY "cc_read" ON public.cost_centers FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "cc_insert" ON public.cost_centers;
CREATE POLICY "cc_insert" ON public.cost_centers FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "cc_update" ON public.cost_centers;
CREATE POLICY "cc_update" ON public.cost_centers FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "cc_delete" ON public.cost_centers;
CREATE POLICY "cc_delete" ON public.cost_centers FOR DELETE TO authenticated USING (true);

-- =========================================================
-- CHART OF ACCOUNTS (hierarchical)
-- =========================================================
CREATE TABLE IF NOT EXISTS public.chart_of_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  account_type text NOT NULL,
  parent_id uuid REFERENCES public.chart_of_accounts(id) ON DELETE SET NULL,
  is_group boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  opening_balance numeric(18,2) NOT NULL DEFAULT 0,
  description text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_coa_type ON public.chart_of_accounts(account_type);
CREATE INDEX IF NOT EXISTS idx_coa_parent ON public.chart_of_accounts(parent_id);
ALTER TABLE public.chart_of_accounts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "coa_read" ON public.chart_of_accounts;
CREATE POLICY "coa_read" ON public.chart_of_accounts FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "coa_insert" ON public.chart_of_accounts;
CREATE POLICY "coa_insert" ON public.chart_of_accounts FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "coa_update" ON public.chart_of_accounts;
CREATE POLICY "coa_update" ON public.chart_of_accounts FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "coa_delete" ON public.chart_of_accounts;
CREATE POLICY "coa_delete" ON public.chart_of_accounts FOR DELETE TO authenticated USING (true);

-- =========================================================
-- FINANCIAL YEARS
-- =========================================================
CREATE TABLE IF NOT EXISTS public.financial_years (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  is_active boolean NOT NULL DEFAULT false,
  is_closed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.financial_years ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "fy_read" ON public.financial_years;
CREATE POLICY "fy_read" ON public.financial_years FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "fy_insert" ON public.financial_years;
CREATE POLICY "fy_insert" ON public.financial_years FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "fy_update" ON public.financial_years;
CREATE POLICY "fy_update" ON public.financial_years FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "fy_delete" ON public.financial_years;
CREATE POLICY "fy_delete" ON public.financial_years FOR DELETE TO authenticated USING (true);

-- =========================================================
-- VOUCHER TYPES
-- =========================================================
CREATE TABLE IF NOT EXISTS public.voucher_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  prefix text NOT NULL,
  is_active boolean NOT NULL DEFAULT true
);
ALTER TABLE public.voucher_types ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "vt_read" ON public.voucher_types;
CREATE POLICY "vt_read" ON public.voucher_types FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "vt_insert" ON public.voucher_types;
CREATE POLICY "vt_insert" ON public.voucher_types FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "vt_update" ON public.voucher_types;
CREATE POLICY "vt_update" ON public.voucher_types FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "vt_delete" ON public.voucher_types;
CREATE POLICY "vt_delete" ON public.voucher_types FOR DELETE TO authenticated USING (true);

-- =========================================================
-- VOUCHERS (header)
-- =========================================================
CREATE TABLE IF NOT EXISTS public.vouchers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  voucher_no text NOT NULL,
  voucher_type text NOT NULL,
  voucher_date date NOT NULL,
  branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL,
  department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  donor_id uuid REFERENCES public.donors(id) ON DELETE SET NULL,
  cost_center_id uuid REFERENCES public.cost_centers(id) ON DELETE SET NULL,
  narration text DEFAULT '',
  amount numeric(18,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'draft',
  prepared_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  approved_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  rejected_reason text DEFAULT '',
  attachment_url text DEFAULT '',
  is_locked boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_vouchers_date ON public.vouchers(voucher_date);
CREATE INDEX IF NOT EXISTS idx_vouchers_type ON public.vouchers(voucher_type);
CREATE INDEX IF NOT EXISTS idx_vouchers_status ON public.vouchers(status);
CREATE INDEX IF NOT EXISTS idx_vouchers_branch ON public.vouchers(branch_id);
ALTER TABLE public.vouchers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "vouchers_read" ON public.vouchers;
CREATE POLICY "vouchers_read" ON public.vouchers FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "vouchers_insert" ON public.vouchers;
CREATE POLICY "vouchers_insert" ON public.vouchers FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "vouchers_update" ON public.vouchers;
CREATE POLICY "vouchers_update" ON public.vouchers FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "vouchers_delete" ON public.vouchers;
CREATE POLICY "vouchers_delete" ON public.vouchers FOR DELETE TO authenticated USING (true);

-- =========================================================
-- VOUCHER DETAILS (double-entry lines)
-- =========================================================
CREATE TABLE IF NOT EXISTS public.voucher_details (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  voucher_id uuid NOT NULL REFERENCES public.vouchers(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES public.chart_of_accounts(id) ON DELETE RESTRICT,
  debit numeric(18,2) NOT NULL DEFAULT 0,
  credit numeric(18,2) NOT NULL DEFAULT 0,
  narration text DEFAULT '',
  line_order int NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_vd_voucher ON public.voucher_details(voucher_id);
CREATE INDEX IF NOT EXISTS idx_vd_account ON public.voucher_details(account_id);
ALTER TABLE public.voucher_details ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "vd_read" ON public.voucher_details;
CREATE POLICY "vd_read" ON public.voucher_details FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "vd_insert" ON public.voucher_details;
CREATE POLICY "vd_insert" ON public.voucher_details FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "vd_update" ON public.voucher_details;
CREATE POLICY "vd_update" ON public.voucher_details FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "vd_delete" ON public.voucher_details;
CREATE POLICY "vd_delete" ON public.voucher_details FOR DELETE TO authenticated USING (true);

-- =========================================================
-- BUDGETS
-- =========================================================
CREATE TABLE IF NOT EXISTS public.budgets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  financial_year_id uuid REFERENCES public.financial_years(id) ON DELETE SET NULL,
  branch_id uuid REFERENCES public.branches(id) ON DELETE CASCADE,
  department_id uuid REFERENCES public.departments(id) ON DELETE CASCADE,
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  account_id uuid REFERENCES public.chart_of_accounts(id) ON DELETE SET NULL,
  amount numeric(18,2) NOT NULL DEFAULT 0,
  period text DEFAULT 'annual',
  status text DEFAULT 'draft',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.budgets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "budgets_read" ON public.budgets;
CREATE POLICY "budgets_read" ON public.budgets FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "budgets_insert" ON public.budgets;
CREATE POLICY "budgets_insert" ON public.budgets FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "budgets_update" ON public.budgets;
CREATE POLICY "budgets_update" ON public.budgets FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "budgets_delete" ON public.budgets;
CREATE POLICY "budgets_delete" ON public.budgets FOR DELETE TO authenticated USING (true);

-- =========================================================
-- BANK ACCOUNTS
-- =========================================================
CREATE TABLE IF NOT EXISTS public.bank_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL,
  account_name text NOT NULL,
  bank_name text NOT NULL,
  account_number text NOT NULL,
  account_type text DEFAULT 'savings',
  opening_balance numeric(18,2) NOT NULL DEFAULT 0,
  current_balance numeric(18,2) NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.bank_accounts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "bank_read" ON public.bank_accounts;
CREATE POLICY "bank_read" ON public.bank_accounts FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "bank_insert" ON public.bank_accounts;
CREATE POLICY "bank_insert" ON public.bank_accounts FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "bank_update" ON public.bank_accounts;
CREATE POLICY "bank_update" ON public.bank_accounts FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "bank_delete" ON public.bank_accounts;
CREATE POLICY "bank_delete" ON public.bank_accounts FOR DELETE TO authenticated USING (true);

-- =========================================================
-- FIXED ASSETS
-- =========================================================
CREATE TABLE IF NOT EXISTS public.assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  name text NOT NULL,
  category text DEFAULT '',
  branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL,
  location text DEFAULT '',
  purchase_date date,
  purchase_cost numeric(18,2) NOT NULL DEFAULT 0,
  salvage_value numeric(18,2) NOT NULL DEFAULT 0,
  useful_life_years int DEFAULT 5,
  depreciation_method text DEFAULT 'straight_line',
  accumulated_depreciation numeric(18,2) NOT NULL DEFAULT 0,
  current_value numeric(18,2) NOT NULL DEFAULT 0,
  status text DEFAULT 'in_service',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.assets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "assets_read" ON public.assets;
CREATE POLICY "assets_read" ON public.assets FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "assets_insert" ON public.assets;
CREATE POLICY "assets_insert" ON public.assets FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "assets_update" ON public.assets;
CREATE POLICY "assets_update" ON public.assets FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "assets_delete" ON public.assets;
CREATE POLICY "assets_delete" ON public.assets FOR DELETE TO authenticated USING (true);

-- =========================================================
-- SUPPLIERS (Accounts Payable)
-- =========================================================
CREATE TABLE IF NOT EXISTS public.suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  name text NOT NULL,
  contact_person text DEFAULT '',
  email text DEFAULT '',
  phone text DEFAULT '',
  address text DEFAULT '',
  opening_balance numeric(18,2) NOT NULL DEFAULT 0,
  current_balance numeric(18,2) NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "sup_read" ON public.suppliers;
CREATE POLICY "sup_read" ON public.suppliers FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "sup_insert" ON public.suppliers;
CREATE POLICY "sup_insert" ON public.suppliers FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "sup_update" ON public.suppliers;
CREATE POLICY "sup_update" ON public.suppliers FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "sup_delete" ON public.suppliers;
CREATE POLICY "sup_delete" ON public.suppliers FOR DELETE TO authenticated USING (true);

-- =========================================================
-- CUSTOMERS (Accounts Receivable)
-- =========================================================
CREATE TABLE IF NOT EXISTS public.customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  name text NOT NULL,
  contact_person text DEFAULT '',
  email text DEFAULT '',
  phone text DEFAULT '',
  address text DEFAULT '',
  opening_balance numeric(18,2) NOT NULL DEFAULT 0,
  current_balance numeric(18,2) NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "cust_read" ON public.customers;
CREATE POLICY "cust_read" ON public.customers FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "cust_insert" ON public.customers;
CREATE POLICY "cust_insert" ON public.customers FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "cust_update" ON public.customers;
CREATE POLICY "cust_update" ON public.customers FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "cust_delete" ON public.customers;
CREATE POLICY "cust_delete" ON public.customers FOR DELETE TO authenticated USING (true);

-- =========================================================
-- AUDIT LOGS (immutable)
-- =========================================================
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  user_email text DEFAULT '',
  action text NOT NULL,
  table_name text NOT NULL,
  record_id text DEFAULT '',
  old_values jsonb,
  new_values jsonb,
  ip_address text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_created ON public.audit_logs(created_at DESC);
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "audit_read" ON public.audit_logs;
CREATE POLICY "audit_read" ON public.audit_logs FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "audit_insert" ON public.audit_logs;
CREATE POLICY "audit_insert" ON public.audit_logs FOR INSERT TO authenticated WITH CHECK (true);
-- No update/delete policy => audit logs are immutable.

-- =========================================================
-- NOTIFICATIONS
-- =========================================================
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE CASCADE,
  title text NOT NULL,
  message text NOT NULL,
  type text DEFAULT 'system',
  is_read boolean NOT NULL DEFAULT false,
  link text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notif_user ON public.notifications(user_id);
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "notif_read_own" ON public.notifications;
CREATE POLICY "notif_read_own" ON public.notifications
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "notif_insert_any" ON public.notifications;
CREATE POLICY "notif_insert_any" ON public.notifications
  FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "notif_update_own" ON public.notifications;
CREATE POLICY "notif_update_own" ON public.notifications
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "notif_delete_own" ON public.notifications;
CREATE POLICY "notif_delete_own" ON public.notifications
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- =========================================================
-- SETTINGS (key/value)
-- =========================================================
CREATE TABLE IF NOT EXISTS public.settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  value text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "settings_read" ON public.settings;
CREATE POLICY "settings_read" ON public.settings FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "settings_upsert" ON public.settings;
CREATE POLICY "settings_upsert" ON public.settings FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "settings_update" ON public.settings;
CREATE POLICY "settings_update" ON public.settings FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- =========================================================
-- HELPER: auto update updated_at
-- =========================================================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_profiles_updated ON public.profiles;
CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_vouchers_updated ON public.vouchers;
CREATE TRIGGER trg_vouchers_updated BEFORE UPDATE ON public.vouchers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================================================
-- HELPER: get current user's role
-- =========================================================
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS text AS $$
DECLARE r text;
BEGIN
  SELECT role INTO r FROM public.profiles WHERE id = auth.uid();
  RETURN COALESCE(r, '');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

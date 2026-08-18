export type Role =
  | 'super_admin'
  | 'executive_director'
  | 'deputy_executive_director'
  | 'head_of_finance'
  | 'finance_manager'
  | 'accounts_manager'
  | 'accountant'
  | 'project_manager'
  | 'project_staff'
  | 'branch_manager'
  | 'auditor';

export type VoucherTypeCode =
  | 'BPV'
  | 'CPV'
  | 'BRV'
  | 'CRV'
  | 'JV'
  | 'CV'
  | 'AV'
  | 'OV'
  | 'CLV'
  // Legacy codes kept for backward compatibility with existing vouchers
  | 'PV'
  | 'RV';

export type VoucherStatus =
  | 'draft'
  | 'submitted'
  | 'reviewed'
  | 'checked'
  | 'verified'
  | 'approved'
  | 'rejected'
  | 'posted'
  | 'locked';

export type AccountType =
  | 'asset'
  | 'liability'
  | 'equity'
  | 'income'
  | 'expense';

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  phone: string;
  role: Role;
  roles?: Role[];
  branch_id: string | null;
  department_id: string | null;
  project_id: string | null;
  is_active: boolean;
  avatar_url: string;
  signature_url: string | null;
  seal_url: string | null;
  designation: string | null;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
}

export type OfficeType = 'head_office' | 'project_office' | 'field_office' | 'sub_office' | 'branch';

export interface Branch {
  id: string;
  code: string;
  name: string;
  division: string;
  region: string;
  district: string;
  address: string;
  phone: string;
  email: string;
  is_active: boolean;
  created_at: string;
  parent_id: string | null;
  office_type: OfficeType;
  project_id: string | null;
  level: number;
}

export interface Department {
  id: string;
  code: string;
  name: string;
  branch_id: string | null;
  is_active: boolean;
  created_at: string;
}

export interface Donor {
  id: string;
  code: string;
  name: string;
  contact_person: string;
  email: string;
  phone: string;
  address: string;
  is_active: boolean;
  created_at: string;
}

export interface Project {
  id: string;
  code: string;
  name: string;
  donor_id: string | null;
  branch_id: string | null;
  department_id: string | null;
  start_date: string | null;
  end_date: string | null;
  budget_amount: number;
  status: string;
  is_active: boolean;
  created_at: string;
}

export interface UserProject {
  user_id: string;
  project_id: string;
  assigned_at: string;
  project?: Project;
}

export interface CostCenter {
  id: string;
  code: string;
  name: string;
  branch_id: string | null;
  project_id: string | null;
  is_active: boolean;
  created_at: string;
}

export interface ChartAccount {
  id: string;
  code: string;
  name: string;
  account_type: AccountType;
  parent_id: string | null;
  is_group: boolean;
  is_active: boolean;
  opening_balance: number;
  description: string;
  created_at: string;
  project_id: string | null;
  cloned_from_id: string | null;
}

export interface FinancialYear {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  is_active: boolean;
  is_closed: boolean;
}

export interface VoucherType {
  id: string;
  code: string;
  name: string;
  prefix: string;
  is_active: boolean;
}

export interface Voucher {
  id: string;
  voucher_no: string;
  voucher_type: string;
  voucher_date: string;
  branch_id: string | null;
  department_id: string | null;
  project_id: string | null;
  donor_id: string | null;
  cost_center_id: string | null;
  narration: string;
  amount: number;
  status: VoucherStatus;
  prepared_by: string | null;
  reviewed_by: string | null;
  verified_by: string | null;
  approved_by: string | null;
  rejected_reason: string;
  attachment_url: string;
  is_locked: boolean;
  approval_workflow_id: string | null;
  current_step: number;
  checked_by: string | null;
  posted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface VoucherDetail {
  id: string;
  voucher_id: string;
  account_id: string;
  debit: number;
  credit: number;
  narration: string;
  line_order: number;
}

export interface Budget {
  id: string;
  financial_year_id: string | null;
  branch_id: string | null;
  department_id: string | null;
  project_id: string | null;
  account_id: string | null;
  amount: number;
  period: string;
  status: string;
  created_at: string;
  budget_version_id?: string | null;
  version_label?: string | null;
  prev_year_actual?: number;
  area?: string | null;
  ledger_group?: string | null;
}

export interface BankAccount {
  id: string;
  branch_id: string | null;
  account_name: string;
  bank_name: string;
  account_number: string;
  account_type: string;
  opening_balance: number;
  current_balance: number;
  is_active: boolean;
}

export interface Asset {
  id: string;
  code: string;
  name: string;
  category: string;
  branch_id: string | null;
  location: string;
  purchase_date: string | null;
  purchase_cost: number;
  salvage_value: number;
  useful_life_years: number;
  depreciation_method: string;
  accumulated_depreciation: number;
  current_value: number;
  status: string;
  is_active: boolean;
}

export interface Supplier {
  id: string;
  code: string;
  name: string;
  contact_person: string;
  email: string;
  phone: string;
  address: string;
  opening_balance: number;
  current_balance: number;
  is_active: boolean;
}

export interface Customer {
  id: string;
  code: string;
  name: string;
  contact_person: string;
  email: string;
  phone: string;
  address: string;
  opening_balance: number;
  current_balance: number;
  is_active: boolean;
}

export interface AuditLog {
  id: string;
  user_id: string | null;
  user_email: string;
  action: string;
  table_name: string;
  record_id: string;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  ip_address: string;
  created_at: string;
}

export interface Notification {
  id: string;
  user_id: string;
  title: string;
  message: string;
  type: string;
  is_read: boolean;
  link: string;
  created_at: string;
}

export interface Setting {
  id: string;
  key: string;
  value: string;
  updated_at: string;
}

export interface ApprovalWorkflow {
  id: string;
  name: string;
  office_type: string;
  project_id: string | null;
  branch_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  steps?: ApprovalWorkflowStep[];
}

export interface ApprovalWorkflowStep {
  id: string;
  workflow_id: string;
  step_number: number;
  role: Role;
  action_label: string;
  result_status: string;
  created_at: string;
}

export interface VoucherApproval {
  id: string;
  voucher_id: string;
  step_number: number;
  user_id: string | null;
  user_email: string;
  action: string;
  role_at_time: string;
  comments: string;
  created_at: string;
}

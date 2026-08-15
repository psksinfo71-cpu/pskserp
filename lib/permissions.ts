import type { Role } from './types';

export const ROLE_LABELS: Record<Role, string> = {
  super_admin: 'Super Admin',
  executive_director: 'Executive Director',
  deputy_executive_director: 'Deputy Executive Director',
  head_of_finance: 'Head of Finance',
  finance_manager: 'Finance Manager',
  accounts_manager: 'Accounts / Finance Officer',
  accountant: 'Accountant',
  project_manager: 'Project Manager',
  project_staff: 'Project Staff',
  branch_manager: 'Branch Manager',
  auditor: 'Auditor',
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  super_admin: 'Full system access including delete',
  executive_director: 'Final approval on Head Office vouchers',
  deputy_executive_director: 'View and approve vouchers',
  head_of_finance: 'View and verify vouchers',
  finance_manager: 'View and review (check) vouchers',
  accounts_manager: 'Prepare and submit vouchers',
  accountant: 'Create and edit draft vouchers',
  project_manager: 'Final approval on Project Office vouchers',
  project_staff: 'Check and verify vouchers',
  branch_manager: 'View branch data',
  auditor: 'Read-only access to all reports and audit logs',
};

type Capability =
  | 'manage_users'
  | 'manage_master_data'
  | 'manage_chart_of_accounts'
  | 'create_sub_head'
  | 'manage_financial_years'
  | 'manage_approval_workflows'
  | 'create_voucher'
  | 'edit_voucher'
  | 'delete_voucher'
  | 'review_voucher'
  | 'check_voucher'
  | 'verify_voucher'
  | 'approve_voucher'
  | 'view_all_branches'
  | 'view_consolidated'
  | 'view_reports'
  | 'view_audit_logs'
  | 'manage_settings'
  | 'manage_budget'
  | 'copy_master_data'
  | 'bank_reconciliation';

const CAPABILITIES: Record<Role, Capability[]> = {
  super_admin: [
    'manage_users', 'manage_master_data', 'manage_chart_of_accounts',
    'manage_financial_years', 'manage_approval_workflows',
    'create_voucher', 'edit_voucher', 'delete_voucher',
    'review_voucher', 'check_voucher', 'verify_voucher', 'approve_voucher',
    'view_all_branches', 'view_consolidated', 'view_reports', 'view_audit_logs',
    'manage_settings', 'manage_budget', 'copy_master_data', 'bank_reconciliation',
  ],
  executive_director: [
    'approve_voucher', 'edit_voucher', 'view_all_branches', 'view_consolidated', 'view_reports',
  ],
  deputy_executive_director: [
    'approve_voucher', 'edit_voucher', 'view_all_branches', 'view_consolidated', 'view_reports',
  ],
  head_of_finance: [
    'verify_voucher', 'edit_voucher', 'view_all_branches', 'view_consolidated', 'view_reports', 'create_sub_head',
  ],
  finance_manager: [
    'review_voucher', 'edit_voucher', 'view_all_branches', 'view_consolidated', 'view_reports', 'manage_budget',
    'bank_reconciliation', 'view_audit_logs', 'create_sub_head',
  ],
  accounts_manager: [
    'create_voucher', 'edit_voucher', 'check_voucher', 'view_reports',
  ],
  accountant: ['create_voucher', 'edit_voucher', 'view_reports'],
  project_staff: ['check_voucher', 'verify_voucher', 'view_reports'],
  project_manager: [
    'approve_voucher', 'view_all_branches', 'view_consolidated', 'view_reports',
  ],
  branch_manager: ['view_reports'],
  auditor: ['view_reports', 'view_audit_logs', 'view_consolidated'],
};

export function can(role: Role, capability: Capability): boolean {
  return CAPABILITIES[role]?.includes(capability) ?? false;
}

/**
 * Can the user edit this voucher?
 *
 * Workflow rules:
 * - Accounts Manager / Accountant: can edit only draft or rejected vouchers
 *   that they prepared. Once submitted, they can no longer edit.
 * - Finance Manager: can edit submitted or reviewed vouchers (review step).
 * - Head of Finance: can edit reviewed or verified vouchers (verify step).
 * - Project Manager / Deputy ED / Executive Director: can edit verified/approved vouchers (approve step).
 * - Super Admin: can edit any non-posted/non-locked voucher.
 */
export function canEditVoucher(role: Role, status: string, _isPreparer: boolean): boolean {
  if (status === 'locked') return false;

  if (role === 'super_admin') return true;

  if (['posted'].includes(status)) return false;

  if (role === 'accounts_manager' || role === 'accountant') {
    return status === 'draft' || status === 'rejected';
  }

  if (role === 'finance_manager') {
    return status === 'submitted' || status === 'reviewed';
  }

  if (role === 'project_staff') {
    return status === 'submitted' || status === 'reviewed' || status === 'checked';
  }

  if (role === 'head_of_finance') {
    return status === 'reviewed' || status === 'checked' || status === 'verified';
}

  if (role === 'deputy_executive_director' || role === 'executive_director' || role === 'project_manager') {
    return status === 'verified' || status === 'approved';
  }

  return false;
}

/**
 * Can the user delete this voucher?
 * Only Super Admin can delete. No other role can delete at any stage.
 */
export function canDeleteVoucher(role: Role, _status: string): boolean {
  return role === 'super_admin';
}

export function canManageVoucher(role: Role, status: string, isPreparer: boolean): boolean {
  return canEditVoucher(role, status, isPreparer) || canDeleteVoucher(role, status);
}

export function canApprove(role: Role): boolean {
  return can(role, 'approve_voucher') || can(role, 'review_voucher') || can(role, 'verify_voucher') || can(role, 'check_voucher');
}

export function isReadOnlyRole(role: Role): boolean {
  return role === 'auditor' || role === 'branch_manager';
}

export const ALL_ROLES: Role[] = [
  'super_admin', 'executive_director', 'deputy_executive_director', 'head_of_finance',
  'finance_manager', 'accounts_manager', 'accountant', 'project_staff', 'project_manager', 'branch_manager', 'auditor',
];

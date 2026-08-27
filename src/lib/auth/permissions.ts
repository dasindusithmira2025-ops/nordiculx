import type { StaffRole } from '@/lib/db/schema';

/**
 * Role-based access control.
 *
 * Permissions are DERIVED from a role, never stored per user, so changing what
 * a role can do takes effect for everybody immediately and there is no
 * per-user permission table to drift out of sync.
 *
 * This module is the only definition of who may do what. Hiding a button is
 * presentation; every privileged server action and route handler must call
 * `requireStaff(permission)` — see docs/SECURITY.md § Staff privilege
 * escalation.
 */

export const PERMISSIONS = [
  'products.view',
  'products.manage',
  'inventory.view',
  'inventory.manage',
  'orders.view',
  'orders.manage',
  'orders.cancel',
  'returns.manage',
  'customers.view',
  'customers.manage',
  'reviews.moderate',
  'promotions.manage',
  'content.manage',
  'campaigns.manage',
  'routine.manage',
  'support.view',
  'support.respond',
  'staff.manage',
  'settings.manage',
  'audit.view',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const ALL: readonly Permission[] = PERMISSIONS;

/**
 * Role → permission grants.
 *
 * `owner` is the only role that can manage other staff or change settings that
 * affect money. This keeps a compromised administrator account from minting
 * itself a second owner.
 */
const ROLE_PERMISSIONS: Record<StaffRole, readonly Permission[]> = {
  owner: ALL,

  administrator: ALL.filter(
    (p) => p !== 'staff.manage' && p !== 'settings.manage',
  ),

  product_manager: [
    'products.view',
    'products.manage',
    'inventory.view',
    'inventory.manage',
    'promotions.manage',
    'reviews.moderate',
  ],

  order_manager: [
    'products.view',
    'inventory.view',
    'inventory.manage',
    'orders.view',
    'orders.manage',
    'orders.cancel',
    'returns.manage',
    'customers.view',
    'support.view',
  ],

  content_editor: [
    'products.view',
    'content.manage',
    'campaigns.manage',
    'routine.manage',
  ],

  support: [
    'products.view',
    'inventory.view',
    'orders.view',
    'customers.view',
    'returns.manage',
    'support.view',
    'support.respond',
  ],
};

/** Every permission granted to a role. Empty for a non-staff account. */
export function permissionsFor(
  role: StaffRole | null | undefined,
): Permission[] {
  if (!role) return [];
  return [...(ROLE_PERMISSIONS[role] ?? [])];
}

/** Whether a role grants a permission. The single authorisation predicate. */
export function can(
  role: StaffRole | null | undefined,
  permission: Permission,
): boolean {
  if (!role) return false;
  return (ROLE_PERMISSIONS[role] ?? []).includes(permission);
}

/** Whether a role grants every one of the listed permissions. */
export function canAll(
  role: StaffRole | null | undefined,
  permissions: Permission[],
): boolean {
  return permissions.every((p) => can(role, p));
}

/** Whether a role grants at least one of the listed permissions. */
export function canAny(
  role: StaffRole | null | undefined,
  permissions: Permission[],
): boolean {
  return permissions.some((p) => can(role, p));
}

/** Any staff role at all — used to gate the /admin surface as a whole. */
export function isStaff(role: StaffRole | null | undefined): boolean {
  return Boolean(role);
}

/**
 * Roles that must complete a second factor before reaching the admin. These
 * accounts can move money or change what other staff may do.
 */
const MFA_REQUIRED_ROLES: readonly StaffRole[] = ['owner', 'administrator'];

export function requiresMfa(role: StaffRole | null | undefined): boolean {
  return Boolean(role && MFA_REQUIRED_ROLES.includes(role));
}

export const ROLE_LABELS: Record<StaffRole, string> = {
  owner: 'Owner',
  administrator: 'Administrator',
  product_manager: 'Product Manager',
  order_manager: 'Order Manager',
  content_editor: 'Content Editor',
  support: 'Support',
};

export const ADMIN_PASSWORD_MIN_LENGTH: 12
export const ADMIN_PASSWORD_MAX_LENGTH: 72
export const ADMIN_PASSWORD_POLICY_MESSAGE: string
export function isStrongAdminPassword(password: unknown, minimumLength?: number): password is string
export function randomStrongAdminPassword(): string

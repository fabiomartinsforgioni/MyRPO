export interface TenantContext {
  userId: string;
  companyId: string;
  role: 'ADMIN' | 'CONSULTANT';
  teamIds: readonly string[];
}

export interface HourOwnership {
  companyId: string;
  ownerId: string;
}

export function canReadHours(context: TenantContext, hours: HourOwnership): boolean {
  return hours.companyId === context.companyId
    && (context.role === 'ADMIN' || hours.ownerId === context.userId);
}

export function ownHours(context: TenantContext): HourOwnership {
  return { companyId: context.companyId, ownerId: context.userId };
}

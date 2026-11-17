import { NIL_UUID } from './ids.js';

/** Who is calling. `companyId` is set from the company-key header on gRPC calls. */
export type ServiceCall = {
  source: 'rest' | 'grpc';
  companyId?: string;
  /** signed-in user behind a REST call, recorded in the change history */
  actorUserId?: string;
};

/**
 * Company a gRPC caller is confined to, or undefined when no confinement applies
 * (REST, or single-company mode). The nil id means the call had no valid company-key; it
 * matches no company row, so every lookup fails. Fail closed, never open.
 */
export function confinedCompany(multiCompany: boolean, call: ServiceCall): string | undefined {
  if (!multiCompany || call.source !== 'grpc') {
    return undefined;
  }
  return call.companyId ?? NIL_UUID;
}

export type BulkContractAction = 'cancel' | 'archive' | 'unarchive';

export interface BulkContractInput {
  action: BulkContractAction;
  ids: string[];
  /** Required by the API when cancelling. */
  reason?: string;
}

export interface BulkContractResult {
  succeeded: number;
  failed: number;
  results: { id: string; code: string; ok: boolean; error?: { code: string; message: string } }[];
}

export interface ReassignInput {
  managerId: string;
  reason: string;
}

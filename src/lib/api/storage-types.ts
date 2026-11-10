/** S3-compatible location as the API shows it: never the secret, only the last characters of the access key. */
export interface S3StorageView {
  driver: 's3';
  endpoint: string;
  region: string;
  bucket: string;
  prefix: string;
  forcePathStyle: boolean;
  hasSecret: boolean;
  accessKeyLast4: string;
}

export type StorageView = { driver: 'disk' } | S3StorageView;

export type StorageSettings = StorageView & {
  /** Saved destination that still needs a migration before it becomes the active one. */
  pending: StorageView | null;
  migrating: boolean;
};

export type StorageInput =
  | { driver: 'disk' }
  | {
      driver: 's3';
      endpoint: string;
      region: string;
      bucket: string;
      accessKeyId: string;
      /** Omit to keep the stored secret (only when endpoint, bucket and access key are unchanged). */
      secretAccessKey?: string;
      prefix: string;
      forcePathStyle: boolean;
    };

export interface StorageTestResult {
  ok: boolean;
  latencyMs: number;
  steps: { name: string; ok: boolean; message: string }[];
}

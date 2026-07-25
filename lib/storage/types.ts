export interface PutResult {
  key: string;
  sizeBytes: number;
}

export interface StorageAdapter {
  put(key: string, data: Buffer, contentType: string): Promise<PutResult>;
  get(key: string): Promise<Buffer>;
  del(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
}

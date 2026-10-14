import "server-only";
import { createReadStream } from "node:fs";
import { mkdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import {
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

export interface StoredObject {
  body: ReadableStream<Uint8Array>;
  size?: number;
}

export interface StorageDriver {
  readonly name: string;
  put(key: string, data: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<StoredObject | null>;
  /** Removes every object under a key prefix (all variants of one photo). */
  deletePrefix(prefix: string): Promise<void>;
}

const safeKey = (key: string) => {
  if (key.includes("..") || path.isAbsolute(key)) throw new Error(`Invalid storage key: ${key}`);
  return key;
};

export class LocalStorage implements StorageDriver {
  readonly name = "local";
  constructor(private root: string) {}

  private resolve(key: string) {
    return path.join(this.root, safeKey(key));
  }

  async put(key: string, data: Buffer) {
    const file = this.resolve(key);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, data);
  }

  async get(key: string): Promise<StoredObject | null> {
    const file = this.resolve(key);
    try {
      const s = await stat(file);
      const stream = Readable.toWeb(createReadStream(file)) as ReadableStream<Uint8Array>;
      return { body: stream, size: s.size };
    } catch {
      return null;
    }
  }

  async deletePrefix(prefix: string) {
    await rm(this.resolve(prefix), { recursive: true, force: true });
  }
}

export class S3Storage implements StorageDriver {
  readonly name = "s3";
  constructor(
    private client: S3Client,
    private bucket: string,
  ) {}

  async put(key: string, data: Buffer, contentType: string) {
    await this.client.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: safeKey(key), Body: data, ContentType: contentType }),
    );
  }

  async get(key: string): Promise<StoredObject | null> {
    try {
      const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: safeKey(key) }));
      if (!res.Body) return null;
      return {
        body: res.Body.transformToWebStream() as ReadableStream<Uint8Array>,
        size: res.ContentLength,
      };
    } catch (err) {
      const e = err as { name?: string; $metadata?: { httpStatusCode?: number } };
      if (e.name === "NoSuchKey" || e.$metadata?.httpStatusCode === 404) return null;
      throw err;
    }
  }

  async deletePrefix(prefix: string) {
    const listed = await this.client.send(
      new ListObjectsV2Command({ Bucket: this.bucket, Prefix: safeKey(prefix.endsWith("/") ? prefix : `${prefix}/`) }),
    );
    const keys = (listed.Contents ?? []).map((o) => ({ Key: o.Key! }));
    if (keys.length) {
      await this.client.send(new DeleteObjectsCommand({ Bucket: this.bucket, Delete: { Objects: keys } }));
    }
  }
}

export class StorageConfigError extends Error {}

export function createStorageFromEnv(env: NodeJS.ProcessEnv = process.env): StorageDriver {
  const driver = (env.STORAGE_DRIVER ?? "local").toLowerCase();
  if (driver === "local") {
    // turbopackIgnore keeps the build from tracing the whole project for this runtime path
    return new LocalStorage(path.resolve(/* turbopackIgnore: true */ process.cwd(), env.STORAGE_DIR ?? "./storage/uploads"));
  }
  if (driver === "s3") {
    const missing = ["S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"].filter((k) => !env[k]);
    if (missing.length) {
      throw new StorageConfigError(`STORAGE_DRIVER=s3 but ${missing.join(", ")} ${missing.length > 1 ? "are" : "is"} not set`);
    }
    const client = new S3Client({
      region: env.S3_REGION || "us-east-1",
      endpoint: env.S3_ENDPOINT || undefined,
      forcePathStyle: env.S3_FORCE_PATH_STYLE !== "false",
      credentials: { accessKeyId: env.S3_ACCESS_KEY_ID!, secretAccessKey: env.S3_SECRET_ACCESS_KEY! },
    });
    return new S3Storage(client, env.S3_BUCKET!);
  }
  throw new StorageConfigError(`Unknown STORAGE_DRIVER "${driver}" (use "local" or "s3")`);
}

let instance: StorageDriver | undefined;
export function storage(): StorageDriver {
  instance ??= createStorageFromEnv();
  return instance;
}

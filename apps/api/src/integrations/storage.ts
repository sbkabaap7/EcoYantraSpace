import { CreateBucketCommand, GetObjectCommand, HeadBucketCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

import { env } from "../config/env.js";

const client = new S3Client({ credentials: { accessKeyId: env.AWS_ACCESS_KEY_ID, secretAccessKey: env.AWS_SECRET_ACCESS_KEY }, endpoint: env.S3_ENDPOINT, forcePathStyle: true, region: "us-east-1" });
export async function ensureBucket(): Promise<void> { try { await client.send(new HeadBucketCommand({ Bucket: env.S3_BUCKET })); } catch { await client.send(new CreateBucketCommand({ Bucket: env.S3_BUCKET })); } }
export async function putObject(key: string, body: Buffer, contentType: string): Promise<string> { await client.send(new PutObjectCommand({ Bucket: env.S3_BUCKET, Key: key, Body: body, ContentType: contentType })); return key; }
export async function getObjectBuffer(key: string): Promise<Buffer> { const result = await client.send(new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: key })); return Buffer.from(await result.Body!.transformToByteArray()); }

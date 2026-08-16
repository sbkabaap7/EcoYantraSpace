import { Redis } from "ioredis";

import { env } from "../config/env.js";

export const redis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null, lazyConnect: true });
export const redisConnection = { connection: redis };

export async function connectRedis(): Promise<void> { if (redis.status === "wait") await redis.connect(); }
export async function disconnectRedis(): Promise<void> { if (redis.status !== "end") await redis.quit(); }
export async function redisReady(): Promise<boolean> {
  if (redis.status !== "ready") return false;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      redis.ping(),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error("Redis readiness check timed out.")), 2_500);
      }),
    ]);
    return true;
  } catch {
    return false;
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

import { Redis } from "ioredis";

import { env } from "../config/env.js";

export const redis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null, lazyConnect: true });
export const redisConnection = { connection: redis };

export async function connectRedis(): Promise<void> { if (redis.status === "wait") await redis.connect(); }
export async function disconnectRedis(): Promise<void> { if (redis.status !== "end") await redis.quit(); }
export function redisReady(): boolean { return redis.status === "ready"; }

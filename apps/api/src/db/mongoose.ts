import mongoose from "mongoose";

import { env } from "../config/env.js";
import { logger } from "../observability/logger.js";

export async function connectDatabase(): Promise<void> {
  await mongoose.connect(env.MONGODB_URI, { serverSelectionTimeoutMS: 5_000 });
  logger.info("MongoDB connected");
}

export async function disconnectDatabase(): Promise<void> {
  await mongoose.disconnect();
}

export async function databaseReady(): Promise<boolean> {
  if (mongoose.connection.readyState !== mongoose.ConnectionStates.connected || !mongoose.connection.db) {
    return false;
  }
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      mongoose.connection.db.admin().command({ ping: 1 }),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error("MongoDB readiness check timed out.")), 2_500);
      }),
    ]);
    return true;
  } catch {
    return false;
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

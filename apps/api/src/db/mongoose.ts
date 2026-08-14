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

export function databaseReady(): boolean { return mongoose.connection.readyState === mongoose.ConnectionStates.connected; }

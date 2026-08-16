import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const owned = {
  type: Schema.Types.ObjectId,
  required: true,
  index: true,
  ref: "Project",
} as const;

const userSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ["admin", "member"], default: "member" },
  },
  { timestamps: true },
);

const refreshSessionSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, required: true, ref: "User", index: true },
    tokenHash: { type: String, required: true, unique: true },
    familyId: { type: String, required: true, index: true },
    expiresAt: { type: Date, required: true },
    lastUsedAt: { type: Date, required: true },
    revokedAt: Date,
    revocationReason: String,
    replacementTokenHash: String,
    userAgent: String,
    ipAddress: String,
  },
  { timestamps: true },
);
refreshSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const projectSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    ownerId: { type: Schema.Types.ObjectId, required: true, ref: "User", index: true },
    memberIds: [{ type: Schema.Types.ObjectId, ref: "User" }],
  },
  { timestamps: true },
);

const forecastSchema = new Schema(
  {
    projectId: owned,
    requestedBy: { type: Schema.Types.ObjectId, required: true, ref: "User" },
    request: { type: Schema.Types.Mixed, required: true },
    result: { type: Schema.Types.Mixed, required: true },
    model: String,
  },
  { timestamps: true },
);

const deviceSchema = new Schema(
  {
    projectId: owned,
    externalId: { type: String, required: true },
    name: { type: String, required: true },
    metadata: Schema.Types.Mixed,
  },
  { timestamps: true },
);
deviceSchema.index({ projectId: 1, externalId: 1 }, { unique: true });

const alertSchema = new Schema(
  {
    projectId: owned,
    deviceId: { type: Schema.Types.ObjectId, required: true, ref: "Device", index: true },
    upstreamAlertId: { type: String, required: true },
    reading: Schema.Types.Mixed,
    payload: { type: Schema.Types.Mixed, required: true },
    observedAt: { type: Date, index: true },
    status: String,
    severity: String,
  },
  { timestamps: true },
);
alertSchema.index({ projectId: 1, upstreamAlertId: 1 }, { unique: true });
alertSchema.index({ projectId: 1, deviceId: 1, observedAt: -1 });

const forestSchema = new Schema(
  {
    projectId: owned,
    requestedBy: { type: Schema.Types.ObjectId, required: true, ref: "User" },
    status: {
      type: String,
      enum: ["queued", "processing", "completed", "failed"],
      default: "queued",
    },
    request: { type: Schema.Types.Mixed, required: true },
    result: Schema.Types.Mixed,
    artifactKeys: [String],
    error: String,
    jobId: String,
  },
  { timestamps: true },
);

const auditSchema = new Schema(
  {
    projectId: { type: Schema.Types.ObjectId, ref: "Project", index: true },
    actorId: { type: Schema.Types.ObjectId, ref: "User", index: true },
    action: { type: String, required: true },
    requestId: String,
    metadata: Schema.Types.Mixed,
  },
  { timestamps: true },
);

export type User = InferSchemaType<typeof userSchema>;
type RefreshSession = InferSchemaType<typeof refreshSessionSchema>;
type Project = InferSchemaType<typeof projectSchema>;
type CarbonForecast = InferSchemaType<typeof forecastSchema>;
type Device = InferSchemaType<typeof deviceSchema>;
type AnomalyAlert = InferSchemaType<typeof alertSchema>;
type ForestAnalysis = InferSchemaType<typeof forestSchema>;
type AuditLog = InferSchemaType<typeof auditSchema>;

export const UserModel: Model<User> =
  (mongoose.models.User as Model<User> | undefined) ?? mongoose.model<User>("User", userSchema);
export const RefreshSessionModel: Model<RefreshSession> =
  (mongoose.models.RefreshSession as Model<RefreshSession> | undefined) ??
  mongoose.model<RefreshSession>("RefreshSession", refreshSessionSchema);
export const ProjectModel: Model<Project> =
  (mongoose.models.Project as Model<Project> | undefined) ?? mongoose.model<Project>("Project", projectSchema);
export const CarbonForecastModel: Model<CarbonForecast> =
  (mongoose.models.CarbonForecast as Model<CarbonForecast> | undefined) ??
  mongoose.model<CarbonForecast>("CarbonForecast", forecastSchema);
export const DeviceModel: Model<Device> =
  (mongoose.models.Device as Model<Device> | undefined) ?? mongoose.model<Device>("Device", deviceSchema);
export const AnomalyAlertModel: Model<AnomalyAlert> =
  (mongoose.models.AnomalyAlert as Model<AnomalyAlert> | undefined) ??
  mongoose.model<AnomalyAlert>("AnomalyAlert", alertSchema);
export const ForestAnalysisModel: Model<ForestAnalysis> =
  (mongoose.models.ForestAnalysis as Model<ForestAnalysis> | undefined) ??
  mongoose.model<ForestAnalysis>("ForestAnalysis", forestSchema);
export const AuditLogModel: Model<AuditLog> =
  (mongoose.models.AuditLog as Model<AuditLog> | undefined) ??
  mongoose.model<AuditLog>("AuditLog", auditSchema);

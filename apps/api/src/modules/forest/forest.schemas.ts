import { z } from "zod";

export const forestResourceIdSchema = z.string().regex(/^[a-f\d]{24}$/i, "Invalid resource ID.");

export const forestStatusSchema = z.enum(["queued", "processing", "completed", "failed"]);

const satelliteFields = {
  after_end: z.string().date(),
  after_start: z.string().date(),
  before_end: z.string().date(),
  before_start: z.string().date(),
  east: z.number().min(-180).max(180),
  max_cloud: z.number().min(0).max(90).default(20),
  minimum_patch_hectares: z.number().min(0.05).max(50).default(0.5),
  north: z.number().min(-90).max(90),
  projectId: forestResourceIdSchema,
  sensitivity: z.number().min(0).max(1).default(0.55),
  south: z.number().min(-90).max(90),
  west: z.number().min(-180).max(180),
} as const;

function aoiAreaSqKm(value: { east: number; north: number; south: number; west: number }): number {
  const meanLatitude = ((value.north + value.south) / 2) * (Math.PI / 180);
  const width = 111.32 * Math.cos(meanLatitude) * (value.east - value.west);
  const height = 110.574 * (value.north - value.south);
  return Math.abs(width * height);
}

export const forestSatelliteInputSchema = z
  .object(satelliteFields)
  .strict()
  .superRefine((value, context) => {
    if (value.west >= value.east) {
      context.addIssue({
        code: "custom",
        message: "West longitude must be less than east longitude.",
        path: ["west"],
      });
    }
    if (value.south >= value.north) {
      context.addIssue({
        code: "custom",
        message: "South latitude must be less than north latitude.",
        path: ["south"],
      });
    }
    if (value.before_start > value.before_end) {
      context.addIssue({
        code: "custom",
        message: "The before period start must not follow its end.",
        path: ["before_start"],
      });
    }
    if (value.after_start > value.after_end) {
      context.addIssue({
        code: "custom",
        message: "The after period start must not follow its end.",
        path: ["after_start"],
      });
    }
    if (value.before_end >= value.after_start) {
      context.addIssue({
        code: "custom",
        message: "The before period must end before the after period starts.",
        path: ["after_start"],
      });
    }
    if (value.after_end > new Date().toISOString().slice(0, 10)) {
      context.addIssue({
        code: "custom",
        message: "Satellite dates cannot be in the future.",
        path: ["after_end"],
      });
    }
    if (value.west < value.east && value.south < value.north && aoiAreaSqKm(value) > 2_500) {
      context.addIssue({
        code: "custom",
        message: "The selected area must not exceed 2,500 km².",
        path: ["east"],
      });
    }
  });

export const forestManualInputSchema = z
  .object({
    east: z.coerce.number().min(-180).max(180),
    minimum_patch_hectares: z.coerce.number().min(0.05).max(50).default(0.5),
    north: z.coerce.number().min(-90).max(90),
    projectId: forestResourceIdSchema,
    sensitivity: z.coerce.number().min(0).max(1).default(0.55),
    south: z.coerce.number().min(-90).max(90),
    west: z.coerce.number().min(-180).max(180),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.west >= value.east) {
      context.addIssue({
        code: "custom",
        message: "West longitude must be less than east longitude.",
        path: ["west"],
      });
    }
    if (value.south >= value.north) {
      context.addIssue({
        code: "custom",
        message: "South latitude must be less than north latitude.",
        path: ["south"],
      });
    }
  });

export const forestListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  projectId: forestResourceIdSchema,
  status: forestStatusSchema.optional(),
});

export type ForestManualInput = z.infer<typeof forestManualInputSchema>;
export type ForestSatelliteInput = z.infer<typeof forestSatelliteInputSchema>;

import type { ForestMlResult } from "../integrations/forest-ml/contract.js";

export const forestArtifactNames = [
  "after-input",
  "after-preview",
  "before-input",
  "before-preview",
  "ndvi-delta",
  "overlay",
] as const;

export type ForestArtifactName = (typeof forestArtifactNames)[number];

export interface ExtractedForestArtifact {
  body: Buffer;
  contentType: "image/jpeg" | "image/png";
  name: Exclude<ForestArtifactName, "after-input" | "before-input">;
}

export interface ExtractedForestResult {
  artifacts: ExtractedForestArtifact[];
  result: Record<string, unknown>;
}

const maximumGeneratedArtifactBytes = 20_000_000;

function decodeImageDataUrl(value: string): {
  body: Buffer;
  contentType: "image/jpeg" | "image/png";
} {
  const match = /^data:(image\/(?:jpeg|png));base64,([A-Za-z\d+/=]+)$/.exec(value);
  if (!match?.[1] || !match[2]) {
    throw new Error("Forest ML returned an invalid image artifact.");
  }

  const body = Buffer.from(match[2], "base64");
  if (body.length === 0 || body.length > maximumGeneratedArtifactBytes) {
    throw new Error("Forest ML returned an empty or oversized image artifact.");
  }

  return {
    body,
    contentType: match[1] as "image/jpeg" | "image/png",
  };
}

export function extractForestArtifacts(result: ForestMlResult): ExtractedForestResult {
  const artifacts: ExtractedForestArtifact[] = [];
  const overlay = decodeImageDataUrl(result.overlay_data_url);
  artifacts.push({ ...overlay, name: "overlay" });

  if (result.ndvi_delta_overlay_data_url) {
    const ndviDelta = decodeImageDataUrl(result.ndvi_delta_overlay_data_url);
    artifacts.push({ ...ndviDelta, name: "ndvi-delta" });
  }

  const metrics = { ...result } as Record<string, unknown>;
  delete metrics.ndvi_delta_overlay_data_url;
  delete metrics.overlay_data_url;
  const source = { ...result.source } as Record<string, unknown>;

  if (result.source.type === "automatic_satellite") {
    const { preview_data_url: beforePreviewUrl, ...beforeMetadata } = result.source.before;
    const { preview_data_url: afterPreviewUrl, ...afterMetadata } = result.source.after;
    const beforePreview = decodeImageDataUrl(beforePreviewUrl);
    const afterPreview = decodeImageDataUrl(afterPreviewUrl);
    artifacts.push({ ...beforePreview, name: "before-preview" });
    artifacts.push({ ...afterPreview, name: "after-preview" });
    source.before = beforeMetadata;
    source.after = afterMetadata;
  }

  return {
    artifacts,
    result: {
      ...metrics,
      source,
    },
  };
}

export function artifactExtension(contentType: string): string {
  switch (contentType) {
    case "image/jpeg":
      return "jpg";
    case "image/tiff":
      return "tiff";
    case "image/webp":
      return "webp";
    default:
      return "png";
  }
}

export function artifactNameFromKey(key: string): ForestArtifactName | undefined {
  return forestArtifactNames.find((name) => new RegExp(`/${name}\\.[^/]+$`).test(key));
}

export function artifactContentTypeFromKey(key: string): string {
  if (key.endsWith(".jpg") || key.endsWith(".jpeg")) return "image/jpeg";
  if (key.endsWith(".tiff") || key.endsWith(".tif")) return "image/tiff";
  if (key.endsWith(".webp")) return "image/webp";
  return "image/png";
}

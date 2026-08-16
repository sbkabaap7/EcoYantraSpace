"use client";

import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiBlobRequest, apiRequest } from "./client";
import {
  anomalyDashboardResponseSchema,
  anomalyDevicesResponseSchema,
  anomalyHistoryResponseSchema,
  anomalyRecordResponseSchema,
  carbonContextResponseSchema,
  carbonForecastResponseSchema,
  carbonForecastsResponseSchema,
  forestAnalysesResponseSchema,
  forestAnalysisResponseSchema,
  type AnomalyReadingInput,
  type CarbonForecastInput,
  type ForestAnalysisInput,
  type ForestArtifactName,
} from "./schemas";

const projectKey = (projectId: string | null) => projectId ?? "no-project";

export const apiQueryKeys = {
  projects: (userId: string) => ["projects", userId] as const,
  carbonContext: (projectId: string | null) => ["carbon", projectKey(projectId), "context"] as const,
  carbonForecasts: (projectId: string | null) => ["carbon", projectKey(projectId), "forecasts"] as const,
  anomalyDevices: (projectId: string | null) => ["anomaly", projectKey(projectId), "devices"] as const,
  anomalyDashboard: (projectId: string | null, deviceId: string | null, hours: number) => [
    "anomaly",
    projectKey(projectId),
    "dashboard",
    deviceId ?? "no-device",
    hours,
  ] as const,
  anomalyHistory: (projectId: string | null, deviceId: string | null, limit: number) => [
    "anomaly",
    projectKey(projectId),
    "history",
    deviceId ?? "all-devices",
    limit,
  ] as const,
  forestAnalyses: (projectId: string | null) => ["forest", projectKey(projectId), "analyses"] as const,
  forestAnalysis: (projectId: string | null, analysisId: string | null) => [
    "forest",
    projectKey(projectId),
    "analysis",
    analysisId ?? "no-analysis",
  ] as const,
  forestArtifact: (
    projectId: string | null,
    analysisId: string | null,
    artifact: ForestArtifactName,
  ) => ["forest", projectKey(projectId), "analysis", analysisId ?? "no-analysis", "artifact", artifact] as const,
};

function search(parameters: Record<string, string | number | null>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(parameters)) {
    if (value !== null) query.set(key, String(value));
  }
  return query.toString();
}

export function useCarbonContext(projectId: string | null) {
  return useQuery({
    queryKey: apiQueryKeys.carbonContext(projectId),
    enabled: Boolean(projectId),
    queryFn: async () => {
      const response = await apiRequest(`/carbon/context?${search({ projectId })}`, {
        schema: carbonContextResponseSchema,
      });
      return response.data;
    },
  });
}

export function useCarbonForecasts(projectId: string | null) {
  return useQuery({
    queryKey: apiQueryKeys.carbonForecasts(projectId),
    enabled: Boolean(projectId),
    queryFn: async () => {
      const response = await apiRequest(`/carbon/forecasts?${search({ projectId })}`, {
        schema: carbonForecastsResponseSchema,
      });
      return response.data;
    },
  });
}

export function useCreateCarbonForecast(projectId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CarbonForecastInput) => {
      if (!projectId) throw new Error("Select a project before requesting a carbon forecast.");
      const response = await apiRequest("/carbon/forecasts", {
        method: "POST",
        json: { projectId, ...input },
        schema: carbonForecastResponseSchema,
      });
      return response.data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: apiQueryKeys.carbonForecasts(projectId) });
    },
  });
}

export function useAnomalyDevices(projectId: string | null) {
  return useQuery({
    queryKey: apiQueryKeys.anomalyDevices(projectId),
    enabled: Boolean(projectId),
    queryFn: async () => {
      const response = await apiRequest(`/anomaly/devices?${search({ projectId })}`, {
        schema: anomalyDevicesResponseSchema,
      });
      return response.data;
    },
  });
}

export function useAnomalyDashboard(
  projectId: string | null,
  deviceId: string | null,
  hours: number,
) {
  return useQuery({
    queryKey: apiQueryKeys.anomalyDashboard(projectId, deviceId, hours),
    enabled: Boolean(projectId && deviceId),
    queryFn: async () => {
      const response = await apiRequest(`/anomaly/dashboard?${search({
        projectId,
        device_id: deviceId,
        hours,
      })}`, { schema: anomalyDashboardResponseSchema });
      return response.data;
    },
  });
}

export function useAnomalyHistory(
  projectId: string | null,
  deviceId: string | null,
  limit = 50,
) {
  return useQuery({
    queryKey: apiQueryKeys.anomalyHistory(projectId, deviceId, limit),
    enabled: Boolean(projectId),
    queryFn: async () => {
      const response = await apiRequest(`/anomaly/history?${search({
        projectId,
        device_id: deviceId,
        limit,
      })}`, { schema: anomalyHistoryResponseSchema });
      return response.data;
    },
  });
}

export function useSubmitAnomalyReading(projectId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: AnomalyReadingInput) => {
      if (!projectId) throw new Error("Select a project before submitting an anomaly reading.");
      const response = await apiRequest("/anomaly/readings", {
        method: "POST",
        json: { projectId, ...input },
        schema: anomalyRecordResponseSchema,
      });
      return response.data;
    },
    onSuccess: async (record) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: apiQueryKeys.anomalyDevices(projectId) }),
        queryClient.invalidateQueries({
          queryKey: ["anomaly", projectKey(projectId), "dashboard", record.result.device_id],
        }),
        queryClient.invalidateQueries({
          queryKey: ["anomaly", projectKey(projectId), "history"],
        }),
      ]);
    },
  });
}

export function useForestAnalyses(projectId: string | null) {
  return useQuery({
    queryKey: apiQueryKeys.forestAnalyses(projectId),
    enabled: Boolean(projectId),
    queryFn: async () => {
      const response = await apiRequest(`/forest/analyses?${search({ projectId })}`, {
        schema: forestAnalysesResponseSchema,
      });
      return response.data;
    },
  });
}

export function useForestAnalysis(projectId: string | null, analysisId: string | null) {
  return useQuery({
    queryKey: apiQueryKeys.forestAnalysis(projectId, analysisId),
    enabled: Boolean(projectId && analysisId),
    queryFn: async () => {
      const response = await apiRequest(`/forest/analyses/${analysisId}`, {
        schema: forestAnalysisResponseSchema,
      });
      return response.data;
    },
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === "queued" || status === "processing" ? 2_500 : false;
    },
  });
}

export function useCreateForestAnalysis(projectId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: ForestAnalysisInput) => {
      if (!projectId) throw new Error("Select a project before starting a forest analysis.");
      const response = await apiRequest("/forest/analyses", {
        method: "POST",
        json: { projectId, ...input },
        schema: forestAnalysisResponseSchema,
      });
      return response.data;
    },
    onSuccess: (analysis) => {
      queryClient.setQueryData(apiQueryKeys.forestAnalysis(projectId, analysis.id), analysis);
      void queryClient.invalidateQueries({ queryKey: apiQueryKeys.forestAnalyses(projectId) });
    },
  });
}

function forestArtifactPath(
  analysisId: string,
  artifact: ForestArtifactName,
  relativeUrl?: string | null,
): string {
  if (relativeUrl) {
    if (!relativeUrl.startsWith("/")) throw new Error("Forest artifact URLs must be relative to the Node API.");
    return relativeUrl;
  }
  return `/forest/analyses/${encodeURIComponent(analysisId)}/artifacts/${encodeURIComponent(artifact)}`;
}

export function useForestArtifact(
  projectId: string | null,
  analysisId: string | null,
  artifact: ForestArtifactName,
  relativeUrl?: string | null,
) {
  const artifactQuery = useQuery({
    queryKey: apiQueryKeys.forestArtifact(projectId, analysisId, artifact),
    enabled: Boolean(projectId && analysisId && relativeUrl),
    queryFn: async () => URL.createObjectURL(
      await apiBlobRequest(forestArtifactPath(analysisId!, artifact, relativeUrl!)),
    ),
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: 0,
  });

  useEffect(() => {
    const objectUrl = artifactQuery.data;
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [artifactQuery.data]);

  return artifactQuery;
}

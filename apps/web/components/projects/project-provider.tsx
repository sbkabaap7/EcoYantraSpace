"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "../../lib/api/client";
import { apiQueryKeys } from "../../lib/api/hooks";
import {
  projectResponseSchema,
  projectsResponseSchema,
  type Project,
} from "../../lib/api/schemas";
import { useAuth } from "../auth/auth-provider";

type ProjectsContextValue = {
  activeProject: Project | null;
  activeProjectId: string | null;
  createProject: (name: string) => Promise<Project>;
  error: Error | null;
  isLoading: boolean;
  projects: Project[];
  renameProject: (projectId: string, name: string) => Promise<Project>;
  setActiveProjectId: (projectId: string | null) => void;
};

const ProjectsContext = createContext<ProjectsContextValue | null>(null);

function storageKey(userId: string): string {
  return `ecoyantra:active-project:${userId}`;
}

export function ProjectProvider({ children }: { children: ReactNode }) {
  const { status, user } = useAuth();
  const queryClient = useQueryClient();
  const [selectedProjectId, setActiveProjectIdState] = useState<string | null>(null);

  const projectsQuery = useQuery({
    queryKey: apiQueryKeys.projects(user?.id ?? "no-user"),
    enabled: status === "authenticated" && Boolean(user),
    queryFn: async () => {
      const response = await apiRequest("/projects", { schema: projectsResponseSchema });
      return response.data;
    },
  });

  const projects = useMemo(() => projectsQuery.data ?? [], [projectsQuery.data]);
  const activeProjectId = useMemo(() => {
    if (!user) return null;
    const stored = typeof window === "undefined"
      ? null
      : window.localStorage.getItem(storageKey(user.id));
    const candidate = selectedProjectId ?? stored;
    return candidate && projects.some((project) => project.id === candidate)
      ? candidate
      : (projects[0]?.id ?? null);
  }, [projects, selectedProjectId, user]);

  const setActiveProjectId = useCallback((projectId: string | null) => {
    if (projectId !== null && !projects.some((project) => project.id === projectId)) {
      throw new Error("The selected project is not available to this account.");
    }
    setActiveProjectIdState(projectId);
    if (user) {
      if (projectId) window.localStorage.setItem(storageKey(user.id), projectId);
      else window.localStorage.removeItem(storageKey(user.id));
    }
  }, [projects, user]);

  const createMutation = useMutation({
    mutationFn: async (name: string) => {
      const response = await apiRequest("/projects", {
        method: "POST",
        json: { name },
        schema: projectResponseSchema,
      });
      return response.data;
    },
    onSuccess: async (project) => {
      if (!user) return;
      await queryClient.invalidateQueries({ queryKey: apiQueryKeys.projects(user.id) });
      setActiveProjectIdState(project.id);
      window.localStorage.setItem(storageKey(user.id), project.id);
    },
  });

  const renameMutation = useMutation({
    mutationFn: async ({ projectId, name }: { projectId: string; name: string }) => {
      const response = await apiRequest(`/projects/${projectId}`, {
        method: "PATCH",
        json: { name },
        schema: projectResponseSchema,
      });
      return response.data;
    },
    onSuccess: async () => {
      if (!user) return;
      await queryClient.invalidateQueries({ queryKey: apiQueryKeys.projects(user.id) });
    },
  });

  const createProject = useCallback(
    (name: string) => createMutation.mutateAsync(name.trim()),
    [createMutation],
  );
  const renameProject = useCallback(
    (projectId: string, name: string) => renameMutation.mutateAsync({ projectId, name: name.trim() }),
    [renameMutation],
  );

  const activeProject = projects.find((project) => project.id === activeProjectId) ?? null;
  const error = projectsQuery.error instanceof Error ? projectsQuery.error : null;

  const value = useMemo<ProjectsContextValue>(() => ({
    activeProject,
    activeProjectId,
    createProject,
    error,
    isLoading: projectsQuery.isLoading,
    projects,
    renameProject,
    setActiveProjectId,
  }), [
    activeProject,
    activeProjectId,
    createProject,
    error,
    projects,
    projectsQuery.isLoading,
    renameProject,
    setActiveProjectId,
  ]);

  return <ProjectsContext.Provider value={value}>{children}</ProjectsContext.Provider>;
}

function useProjectContext(): ProjectsContextValue {
  const value = useContext(ProjectsContext);
  if (!value) throw new Error("Project hooks must be used within ProjectProvider.");
  return value;
}

export function useProjects() {
  const { projects, isLoading, error, createProject, renameProject } = useProjectContext();
  return { projects, isLoading, error, createProject, renameProject };
}

export function useActiveProject() {
  const { activeProject, activeProjectId, setActiveProjectId } = useProjectContext();
  return { activeProject, activeProjectId, setActiveProjectId };
}

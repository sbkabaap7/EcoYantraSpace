"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { LoaderCircle } from "lucide-react";

import { useActiveProject, useProjects } from "../projects/project-provider";
import { useAuth } from "./auth-provider";
import styles from "./protected-route.module.css";

export function ProtectedRoute({
  children,
  requireProject = false,
}: {
  children: ReactNode;
  requireProject?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { status } = useAuth();
  const { activeProjectId } = useActiveProject();
  const { isLoading: projectsLoading } = useProjects();

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
      return;
    }
    if (status === "authenticated" && requireProject && !projectsLoading && !activeProjectId) {
      router.replace("/dashboard");
    }
  }, [activeProjectId, pathname, projectsLoading, requireProject, router, status]);

  const waitingForSession = status === "loading";
  const waitingForProject = requireProject && status === "authenticated" && projectsLoading;
  if (waitingForSession || waitingForProject) {
    return (
      <main className={styles.loading} role="status" aria-live="polite">
        <div className="noise-overlay" aria-hidden="true" />
        <LoaderCircle size={22} aria-hidden="true" />
        <div>
          <strong>Restoring your workspace</strong>
          <span>Validating the secure session and project access.</span>
        </div>
      </main>
    );
  }

  if (status !== "authenticated") return null;
  if (requireProject && !activeProjectId) return null;
  return children;
}

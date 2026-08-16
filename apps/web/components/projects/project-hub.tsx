"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Activity,
  ArrowLeft,
  ArrowUpRight,
  Check,
  CloudSun,
  FolderKanban,
  Leaf,
  LoaderCircle,
  LogOut,
  Pencil,
  Plus,
  Satellite,
  X,
} from "lucide-react";

import { useAuth } from "../auth/auth-provider";
import { useActiveProject, useProjects } from "./project-provider";
import styles from "./project-hub.module.css";

const modules = [
  {
    href: "/carbon",
    icon: CloudSun,
    index: "01",
    name: "Carbon Intelligence",
    text: "Run project-scoped energy and emissions forecasts.",
    tone: "carbon",
  },
  {
    href: "/anomaly",
    icon: Activity,
    index: "02",
    name: "Anomaly Intelligence",
    text: "Evaluate energy readings and inspect persisted detections.",
    tone: "anomaly",
  },
  {
    href: "/forest",
    icon: Satellite,
    index: "03",
    name: "Forest Intelligence",
    text: "Queue satellite change analyses for a selected area.",
    tone: "forest",
  },
] as const;

export function ProjectHub() {
  const router = useRouter();
  const { logout, user } = useAuth();
  const { projects, isLoading, error, createProject, renameProject } = useProjects();
  const { activeProject, activeProjectId, setActiveProjectId } = useActiveProject();
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [pending, setPending] = useState<"create" | "rename" | "logout" | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const create = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (newName.trim().length < 2) return;
    setActionError(null);
    setPending("create");
    try {
      await createProject(newName);
      setNewName("");
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : "Could not create the project.");
    } finally {
      setPending(null);
    }
  };

  const beginRename = (projectId: string, name: string) => {
    setEditingId(projectId);
    setEditingName(name);
    setActionError(null);
  };

  const rename = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingId || editingName.trim().length < 2) return;
    setPending("rename");
    setActionError(null);
    try {
      await renameProject(editingId, editingName);
      setEditingId(null);
      setEditingName("");
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : "Could not rename the project.");
    } finally {
      setPending(null);
    }
  };

  const signOut = async () => {
    setPending("logout");
    try {
      await logout();
    } catch {
      // AuthProvider always clears local session state, even if the API is unavailable.
    } finally {
      router.replace("/login");
      setPending(null);
    }
  };

  return (
    <main className={styles.page}>
      <div className={styles.ambient} aria-hidden="true" />
      <div className="noise-overlay" aria-hidden="true" />

      <header className={styles.topbar}>
        <Link href="/" className={styles.brand}><span aria-hidden="true">⬡</span><strong>ECO<em>YANTRA</em>SPACE</strong></Link>
        <div className={styles.account}>
          <div><span>Authenticated as</span><strong>{user?.email}</strong></div>
          <button type="button" onClick={signOut} disabled={pending === "logout"}>{pending === "logout" ? <LoaderCircle className={styles.spinner} size={14} /> : <LogOut size={14} />} Logout</button>
        </div>
      </header>

      <section className={styles.intro}>
        <div>
          <span className={styles.eyebrow}><i /> Project command</span>
          <h1>CHOOSE THE FIELD.<br /><em>DIRECT THE SIGNAL.</em></h1>
        </div>
        <p>Every forecast, reading and satellite analysis is isolated to an authorised project. Select one workspace before entering an intelligence system.</p>
      </section>

      <section className={styles.projectSection} aria-labelledby="projects-title">
        <div className={styles.sectionHeading}>
          <div><span>Your scope</span><h2 id="projects-title">Projects</h2></div>
          <form onSubmit={create} className={styles.createForm}>
            <label htmlFor="new-project">New project</label>
            <input id="new-project" minLength={2} maxLength={120} required value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="e.g. Western Ghats programme" />
            <button type="submit" disabled={pending === "create"}>{pending === "create" ? <LoaderCircle className={styles.spinner} size={14} /> : <Plus size={14} />} Create</button>
          </form>
        </div>

        {actionError ? <p className={styles.actionError} role="alert">{actionError}</p> : null}
        {error ? <div className={styles.queryState} role="alert"><FolderKanban size={20} /><div><strong>Projects could not be loaded</strong><span>{error.message}</span></div></div> : null}
        {isLoading ? <div className={styles.queryState} role="status"><LoaderCircle className={styles.spinner} size={20} /><div><strong>Loading authorised projects</strong><span>Resolving your current project membership.</span></div></div> : null}

        {!isLoading && !error && projects.length === 0 ? (
          <div className={styles.emptyState}>
            <FolderKanban size={23} />
            <div><strong>No projects yet</strong><span>Create the first project above to unlock the intelligence systems.</span></div>
          </div>
        ) : null}

        {!isLoading && projects.length > 0 ? (
          <div className={styles.projectGrid}>
            {projects.map((project) => {
              const active = project.id === activeProjectId;
              const editable = project.ownerId === user?.id;
              return (
                <article key={project.id} className={`${styles.projectCard} ${active ? styles.projectActive : ""}`}>
                  {editingId === project.id ? (
                    <form onSubmit={rename} className={styles.renameForm}>
                      <input aria-label="Project name" minLength={2} maxLength={120} required value={editingName} onChange={(event) => setEditingName(event.target.value)} autoFocus />
                      <button type="submit" aria-label="Save project name" disabled={pending === "rename"}>{pending === "rename" ? <LoaderCircle className={styles.spinner} size={14} /> : <Check size={14} />}</button>
                      <button type="button" aria-label="Cancel rename" onClick={() => setEditingId(null)}><X size={14} /></button>
                    </form>
                  ) : (
                    <>
                      <button type="button" className={styles.selectProject} onClick={() => setActiveProjectId(project.id)} aria-pressed={active}>
                        <span><FolderKanban size={16} /> {active ? "Active project" : "Select project"}</span>
                        <strong>{project.name}</strong>
                        <small>{project.memberIds.length} authorised member{project.memberIds.length === 1 ? "" : "s"}</small>
                      </button>
                      {editable ? <button type="button" className={styles.renameButton} onClick={() => beginRename(project.id, project.name)} aria-label={`Rename ${project.name}`}><Pencil size={13} /></button> : null}
                    </>
                  )}
                </article>
              );
            })}
          </div>
        ) : null}
      </section>

      <section className={styles.modules} aria-labelledby="modules-title">
        <div className={styles.moduleHeading}>
          <div><span>Intelligence layers</span><h2 id="modules-title">Enter a system</h2></div>
          <p>{activeProject ? <>Active scope / <strong>{activeProject.name}</strong></> : "Select or create a project to continue."}</p>
        </div>
        <div className={styles.moduleGrid}>
          {modules.map((module) => {
            const Icon = module.icon;
            const content = <><span className={styles.moduleIndex}>{module.index}</span><span className={styles.moduleIcon}><Icon size={18} /></span><h3>{module.name}</h3><p>{module.text}</p><span className={styles.moduleAction}>Open workspace <ArrowUpRight size={14} /></span></>;
            return activeProject ? <Link key={module.href} href={module.href} className={`${styles.moduleCard} ${styles[`module${module.tone[0]!.toUpperCase()}${module.tone.slice(1)}`]}`}>{content}</Link> : <div key={module.href} className={`${styles.moduleCard} ${styles.moduleDisabled}`} aria-disabled="true">{content}</div>;
          })}
        </div>
      </section>

      <footer className={styles.footer}><Link href="/"><ArrowLeft size={13} /> Landing page</Link><span><Leaf size={12} /> Node API boundary · Project-scoped authorization</span></footer>
    </main>
  );
}

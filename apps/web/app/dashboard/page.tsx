import type { Metadata } from "next";

import { ProjectHub } from "../../components/projects/project-hub";

export const metadata: Metadata = {
  title: "Project command — EcoYantraSpace",
  description: "Select a project and enter an EcoYantraSpace intelligence system.",
};

export default function DashboardPage() {
  return <ProjectHub />;
}

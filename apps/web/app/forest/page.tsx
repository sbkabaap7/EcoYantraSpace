import type { Metadata } from "next";

import { ForestDashboard } from "../../components/forest/forest-dashboard";

export const metadata: Metadata = {
  title: "Forest Intelligence — EcoYantraSpace",
  description: "A geospatial intelligence workspace for forest-cover and change analysis.",
};

export default function ForestPage() {
  return <ForestDashboard />;
}

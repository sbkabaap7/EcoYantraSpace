import type { Metadata } from "next";

import { CarbonDashboard } from "../../components/carbon/carbon-dashboard";

export const metadata: Metadata = {
  title: "Carbon Intelligence — EcoYantraSpace",
  description: "A carbon intelligence workspace for emissions visibility and forecasting.",
};

export default function CarbonPage() {
  return <CarbonDashboard />;
}

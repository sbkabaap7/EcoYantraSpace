import type { Metadata } from "next";

import { AnomalyDashboard } from "../../components/anomaly/anomaly-dashboard";

export const metadata: Metadata = {
  title: "Anomaly Intelligence — EcoYantraSpace",
  description: "Explainable anomaly intelligence for energy telemetry.",
};

export default function AnomalyPage() {
  return <AnomalyDashboard />;
}

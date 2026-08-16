import type { ReactNode } from "react";

import { ProtectedRoute } from "../../components/auth/protected-route";

export default function CarbonLayout({ children }: { children: ReactNode }) {
  return <ProtectedRoute requireProject>{children}</ProtectedRoute>;
}

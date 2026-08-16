import type { Metadata } from "next";

import { AuthForm } from "../../components/auth/auth-form";

export const metadata: Metadata = {
  title: "Sign in — EcoYantraSpace",
  description: "Sign in to your EcoYantraSpace intelligence workspace.",
};

function safeNext(value: string | string[] | undefined): string {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate?.startsWith("/") && !candidate.startsWith("//") ? candidate : "/dashboard";
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const parameters = await searchParams;
  return <AuthForm mode="login" nextPath={safeNext(parameters.next)} />;
}

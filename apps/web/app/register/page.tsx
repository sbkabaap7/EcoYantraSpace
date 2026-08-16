import type { Metadata } from "next";

import { AuthForm } from "../../components/auth/auth-form";

export const metadata: Metadata = {
  title: "Create account — EcoYantraSpace",
  description: "Create secure access to an EcoYantraSpace intelligence workspace.",
};

export default function RegisterPage() {
  return <AuthForm mode="register" />;
}

"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";

import {
  apiRequest,
  apiVoidRequest,
  clearAccessToken,
  setAccessToken,
  setAuthExpiredHandler,
} from "../../lib/api/client";
import {
  authSessionSchema,
  meResponseSchema,
  type User,
} from "../../lib/api/schemas";

type Credentials = { email: string; password: string };
export type AuthStatus = "loading" | "authenticated" | "unauthenticated";

type AuthContextValue = {
  login: (credentials: Credentials) => Promise<User>;
  logout: () => Promise<void>;
  register: (credentials: Credentials) => Promise<User>;
  status: AuthStatus;
  user: User | null;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<User | null>(null);
  const [status, setStatus] = useState<AuthStatus>("loading");

  const expireSession = useCallback(() => {
    clearAccessToken();
    setUser(null);
    setStatus("unauthenticated");
    queryClient.clear();
  }, [queryClient]);

  useEffect(() => {
    setAuthExpiredHandler(expireSession);
    return () => setAuthExpiredHandler(null);
  }, [expireSession]);

  useEffect(() => {
    let active = true;
    void apiRequest("/auth/me", { schema: meResponseSchema })
      .then((response) => {
        if (!active) return;
        setUser(response.user);
        setStatus("authenticated");
      })
      .catch(() => {
        if (!active) return;
        clearAccessToken();
        setUser(null);
        setStatus("unauthenticated");
      });
    return () => {
      active = false;
    };
  }, []);

  const establishSession = useCallback(async (path: "/auth/login" | "/auth/register", credentials: Credentials) => {
    const session = await apiRequest(path, {
      method: "POST",
      json: credentials,
      retryOnUnauthorized: false,
      schema: authSessionSchema,
    });
    queryClient.clear();
    setAccessToken(session.accessToken);
    setUser(session.user);
    setStatus("authenticated");
    return session.user;
  }, [queryClient]);

  const login = useCallback(
    (credentials: Credentials) => establishSession("/auth/login", credentials),
    [establishSession],
  );

  const register = useCallback(
    (credentials: Credentials) => establishSession("/auth/register", credentials),
    [establishSession],
  );

  const logout = useCallback(async () => {
    try {
      await apiVoidRequest("/auth/logout", {
        method: "POST",
        retryOnUnauthorized: false,
      });
    } finally {
      expireSession();
    }
  }, [expireSession]);

  const value = useMemo<AuthContextValue>(() => ({
    login,
    logout,
    register,
    status,
    user,
  }), [login, logout, register, status, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used within AuthProvider.");
  return value;
}

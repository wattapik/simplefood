import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Platform } from "react-native";
import { api, getToken, setToken as persistToken } from "./api";

type AuthUser = { id: number; name: string; email: string };

type AuthContextValue = {
  isLoading: boolean;
  user: AuthUser | null;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    (async () => {
      const token = await getToken();
      if (token) {
        setUser({ id: 0, name: "", email: "" });
      }
      setIsLoading(false);
    })();
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      isLoading,
      user,
      signIn: async (email: string, password: string) => {
        const deviceName = Platform.OS === "web" ? "web" : `${Platform.OS}-app`;
        const { token, user } = await api.login(email, password, deviceName);
        await persistToken(token);
        setUser(user);
      },
      signOut: async () => {
        try {
          await api.logout();
        } catch {
          // token may already be invalid server-side; still clear it locally
        }
        await persistToken(null);
        setUser(null);
      },
    }),
    [isLoading, user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

import { createContext, useContext, useState, useCallback } from "react";
import { api, setToken } from "../api.js";

const AuthCtx = createContext(null);

function loadUser() {
  try { return JSON.parse(localStorage.getItem("amsl_user") || "null"); } catch { return null; }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(loadUser);

  const login = useCallback(async (email, password) => {
    const { data } = await api.login(email, password);
    setToken(data.token);
    setUser(data.user);
    try { localStorage.setItem("amsl_user", JSON.stringify(data.user)); } catch { /* ignore */ }
    return data.user;
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    try { localStorage.removeItem("amsl_user"); } catch { /* ignore */ }
  }, []);

  return <AuthCtx.Provider value={{ user, login, logout }}>{children}</AuthCtx.Provider>;
}

export function useAuth() {
  return useContext(AuthCtx);
}

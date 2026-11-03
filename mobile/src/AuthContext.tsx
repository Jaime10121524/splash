import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import { apiRequest, MobileUser } from './api';

const KEY = 'splash.mobile.auth.token';
type LoginResponse = { token: string; user: MobileUser };

type AuthState = {
  user: MobileUser | null;
  token: string | null;
  ready: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<MobileUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const stored = await SecureStore.getItemAsync(KEY);
        if (!stored) return;
        const result = await apiRequest<{ user: MobileUser }>('mobile/me', { token: stored });
        if (mounted) { setUser(result.user); setToken(stored); }
      } catch {
        // Sem rede, não declaramos sessão válida; mantemos o token seguro para
        // permitir nova tentativa na próxima abertura, sem expor dados privados.
      } finally {
        if (mounted) setReady(true);
      }
    })();
    return () => { mounted = false; };
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const result = await apiRequest<LoginResponse>('mobile/login', {
      method: 'POST', body: { username: username.trim(), password, device_name: 'Aplicativo Splash' },
    });
    try {
      await SecureStore.setItemAsync(KEY, result.token);
    } catch {
      // Não deixar um token remoto utilizável se o armazenamento seguro falhar.
      await apiRequest('mobile/logout', { method: 'POST', token: result.token }).catch(() => {});
      throw new Error('Não foi possível proteger sua sessão neste aparelho.');
    }
    setToken(result.token);
    setUser(result.user);
  }, []);

  const logout = useCallback(async () => {
    if (token) await apiRequest('mobile/logout', { method: 'POST', token });
    await SecureStore.deleteItemAsync(KEY);
    setUser(null); setToken(null);
  }, [token]);

  const state = useMemo(() => ({ user, token, ready, login, logout }), [user, token, ready, login, logout]);
  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth fora do AuthProvider');
  return value;
}

// 用户认证工具
const TOKEN_KEY = 'vvideos_token';
const USER_KEY = 'vvideos_user';

export interface UserInfo {
  user_id: string;
  username: string;
  nickname: string;
  avatar: string;
}

// 获取 token
export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
}

// 保存 token
export function setToken(token: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(TOKEN_KEY, token);
}

// 获取用户信息
export function getUser(): UserInfo | null {
  if (typeof window === 'undefined') return null;
  try {
    const data = localStorage.getItem(USER_KEY);
    return data ? JSON.parse(data) : null;
  } catch {
    return null;
  }
}

// 保存用户信息
export function setUser(user: UserInfo): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

// 是否已登录
export function isLoggedIn(): boolean {
  return !!getToken() && !!getUser();
}

// 退出登录
export function logout(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

// 登录
export async function login(username: string, password: string): Promise<{ success: boolean; message: string; user?: UserInfo }> {
  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    
    if (data.success) {
      setToken(data.data.token);
      setUser(data.data.user);
      return { success: true, message: '登录成功', user: data.data.user };
    }
    return { success: false, message: data.message || '登录失败' };
  } catch {
    return { success: false, message: '网络错误' };
  }
}

// 注册
export async function register(username: string, password: string, nickname?: string): Promise<{ success: boolean; message: string; user?: UserInfo }> {
  try {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, nickname })
    });
    const data = await res.json();
    
    if (data.success) {
      setToken(data.data.token);
      setUser(data.data.user);
      return { success: true, message: '注册成功', user: data.data.user };
    }
    return { success: false, message: data.message || '注册失败' };
  } catch {
    return { success: false, message: '网络错误' };
  }
}

// 获取当前用户信息（从服务器）
export async function fetchCurrentUser(): Promise<UserInfo | null> {
  const token = getToken();
  if (!token) return null;
  
  try {
    const res = await fetch('/api/auth/me', {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    const data = await res.json();
    
    if (data.success) {
      setUser(data.data);
      return data.data;
    }
    // token 过期
    logout();
    return null;
  } catch {
    return null;
  }
}

// 退出登录（服务器端）
export async function serverLogout(): Promise<void> {
  const token = getToken();
  if (token) {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + token }
      });
    } catch {
      // ignore
    }
  }
  logout();
}

import React, { useState } from 'react';
import { authApi, authStorage, AuthResponse } from '../api';
import { Loader2, LogIn, UserPlus } from 'lucide-react';

interface AuthPageProps {
  onSuccess: (auth: AuthResponse) => void;
}

type Mode = 'login' | 'register';

export const AuthPage: React.FC<AuthPageProps> = ({ onSuccess }) => {
  const [mode, setMode] = useState<Mode>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [nickname, setNickname] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleMode = () => {
    setMode(prev => (prev === 'login' ? 'register' : 'login'));
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const payload = { username: username.trim(), password: password.trim(), nickname: nickname.trim() || undefined };
      const res = mode === 'login' ? await authApi.login(payload) : await authApi.register(payload);
      authStorage.setToken(res.token);
      onSuccess(res);
    } catch (err) {
      console.error('Auth failed', err);
      const message = err instanceof Error ? err.message : '操作失败，请稍后再试';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0b0b0f] via-[#0f172a] to-[#0b0b0f] flex items-center justify-center px-6">
      <div className="w-full max-w-md bg-white/5 border border-white/10 rounded-3xl shadow-2xl shadow-blue-900/30 p-8 backdrop-blur">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-2xl bg-blue-600 flex items-center justify-center text-white font-black text-lg shadow-lg shadow-blue-900/40">M</div>
          <div>
            <p className="text-white font-bold text-lg leading-tight">ManjuFlow</p>
            <p className="text-white/50 text-xs">专业漫画影视创作平台</p>
          </div>
        </div>

        <div className="flex items-center justify-between mb-6">
          <div>
            <p className="text-white text-xl font-semibold mb-1">{mode === 'login' ? '登录' : '注册'}</p>
            <p className="text-white/50 text-sm">{mode === 'login' ? '使用账户登录以继续工作' : '白名单邮箱注册新账户'}</p>
          </div>
          <button
            onClick={toggleMode}
            className="text-blue-300 text-sm hover:text-blue-200 underline underline-offset-4"
          >
            {mode === 'login' ? '去注册' : '已有账号？去登录'}
          </button>
        </div>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <label className="text-xs font-semibold text-white/60">邮箱/用户名</label>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-white/20 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
              placeholder="your@email.com"
              required
              autoComplete="username"
            />
          </div>
          {mode === 'register' && (
            <div className="space-y-2">
              <label className="text-xs font-semibold text-white/60">昵称</label>
              <input
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-white/20 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                placeholder="给自己取个名字"
                autoComplete="nickname"
              />
            </div>
          )}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-white/60">密码</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-white/20 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
              placeholder="请输入密码"
              required
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            />
          </div>

          {error && <div className="text-red-400 text-sm bg-red-500/5 border border-red-500/20 rounded-xl px-3 py-2">{error}</div>}

          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold transition-all shadow-lg shadow-blue-900/30 disabled:opacity-60"
          >
            {loading ? <Loader2 size={18} className="animate-spin" /> : mode === 'login' ? <LogIn size={18} /> : <UserPlus size={18} />}
            {mode === 'login' ? '登录' : '注册并登录'}
          </button>
        </form>
      </div>
    </div>
  );
};

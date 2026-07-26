'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Lock } from 'lucide-react';
import { apiUrl } from '@/lib/api';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(apiUrl('/api/auth/login'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to login');
      }

      // Save token and full user object to localStorage
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));

      // Apply user's saved theme preference immediately
      const theme = data.user?.theme_preference || 'light';
      localStorage.setItem('smartvault-theme', theme);
      if (theme === 'dark') {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }

      // Redirect to MainDashboard via hard refresh so all components re-read localStorage
      window.location.href = '/';
      
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred.');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f5f5f7] flex items-center justify-center p-4">
      <div className="bg-[#ffffff] rounded-[24px] shadow-[rgba(0,0,0,0.22)_0px_20px_40px] w-full max-w-[400px] p-8 border border-[rgba(0,0,0,0.08)]">
        
        <div className="flex flex-col items-center mb-8">
          <div className="w-[52px] h-[52px] rounded-[14px] bg-[#f5f5f7] flex items-center justify-center mb-4">
            <Lock className="text-[#1d1d1f]" size={26} />
          </div>
          <h1 className="text-[24px] font-semibold tracking-[-0.374px] text-[#1d1d1f]">
            SmartVault Sign In
          </h1>
          <p className="text-[15px] font-normal tracking-[-0.24px] text-[rgba(0,0,0,0.48)] mt-1 text-center">
            Enter your credentials to securely access your workspace.
          </p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-[#fff0f0] border border-[#ffd6d6] rounded-[11px]">
            <p className="text-[14px] font-medium text-[#e30000] tracking-[-0.224px] text-center">
              {error}
            </p>
          </div>
        )}

        <form onSubmit={handleLogin} className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <label className="text-[13px] font-medium text-[rgba(0,0,0,0.8)] tracking-[-0.12px]">
              Email Address
            </label>
            <input 
              type="email" 
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-[#fafafc] border border-[rgba(0,0,0,0.08)] rounded-[11px] py-[10px] px-[14px] text-[#1d1d1f] text-[17px] tracking-[-0.374px] focus:outline focus:outline-2 focus:outline-[#0071e3] focus:bg-[#ffffff] transition-colors placeholder:text-[rgba(0,0,0,0.24)]"
              placeholder="name@masterfolder.com"
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-[13px] font-medium text-[rgba(0,0,0,0.8)] tracking-[-0.12px]">
              Password
            </label>
            <input 
              type="password" 
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-[#fafafc] border border-[rgba(0,0,0,0.08)] rounded-[11px] py-[10px] px-[14px] text-[#1d1d1f] text-[17px] tracking-[-0.374px] focus:outline focus:outline-2 focus:outline-[#0071e3] focus:bg-[#ffffff] transition-colors placeholder:text-[rgba(0,0,0,0.24)]"
              placeholder="••••••••"
            />
          </div>

          <button 
            type="submit"
            disabled={loading}
            className={`mt-2 w-full bg-[#0066cc] text-[#ffffff] text-[17px] font-medium py-[12px] rounded-[11px] transition-all tracking-[-0.374px] ${loading ? 'opacity-70 cursor-wait' : 'hover:bg-[#0071e3] active:scale-[0.98]'}`}
          >
            {loading ? 'Authenticating...' : 'Sign In'}
          </button>
        </form>

      </div>
    </div>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import AuditLog from '@/components/AuditLog';

export default function AuditPage() {
  const router = useRouter();
  const [isAuthorized, setIsAuthorized] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      router.push('/');
      return;
    }
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      if (payload.role !== 'Admin') {
        router.push('/');
      } else {
        setIsAuthorized(true);
      }
    } catch {
      router.push('/');
    }
  }, [router]);

  if (!isAuthorized) return null; // Prevent UI flash before redirect

  return (
    <div className="w-full h-full bg-[#f5f5f7] flex flex-col p-8">
      {/* Apple-styled header */}
      <div className="mb-6 shrink-0">
        <h1 className="text-[28px] font-semibold tracking-[-0.374px] text-[#1d1d1f]">
          Security Audit Log
        </h1>
        <p className="text-[15px] font-normal tracking-[-0.24px] text-[rgba(0,0,0,0.48)] mt-1">
          Permanent ledger of all system actions. Only Administrators can view this page.
        </p>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 bg-[#ffffff] rounded-[18px] border border-[rgba(0,0,0,0.08)] shadow-[0_4px_24px_rgba(0,0,0,0.02)] overflow-hidden p-6 flex flex-col">
        <AuditLog />
      </div>
    </div>
  );
}

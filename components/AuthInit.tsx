'use client';
import { useEffect } from 'react';
import { useAuthStore } from '@/store/authStore';

export default function AuthInit() {
  const init = useAuthStore(s => s.init);
  useEffect(() => { init(); }, []);
  return null;
}

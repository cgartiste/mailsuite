'use client';
import AppLayout from '@/components/AppLayout';
import AccountsGDetail from '@/components/pages/AccountsGDetail';
import { use } from 'react';
export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <AppLayout><AccountsGDetail id={id} /></AppLayout>;
}

'use client';
import AppLayout from '@/components/AppLayout';
import CfDns from '@/components/pages/CfDns';
import { use } from 'react';
export default function Page({ params }: { params: Promise<{ zid: string }> }) {
  const { zid } = use(params);
  return <AppLayout><CfDns zoneId={zid} /></AppLayout>;
}

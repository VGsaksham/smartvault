'use client';
import { Suspense } from 'react';
import StarredView from '@/components/StarredView';

export default function StarredPage() {
  return <Suspense><StarredView /></Suspense>;
}

import { Suspense } from "react";
import MainDashboard from "@/components/MainDashboard";

export default function Home() {
  return (
    <Suspense fallback={<div>Loading Dashboard...</div>}>
      <MainDashboard />
    </Suspense>
  );
}

import DepartmentDashboard from "@/components/DepartmentDashboard";
import SearchFilters from "@/components/SearchFilters";

export default async function DepartmentPage({ 
  params,
  searchParams
}: { 
  params: Promise<{ id: string }>,
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const { id } = await params;
  const sParams = await searchParams;
  
  const companyId = sParams.companyId as string | null;
  const fyId = sParams.fyId as string | null;
  
  // Department name comes from the managed structure; keep route param as-is (no hardcoded transforms).
  const deptName = decodeURIComponent(id);

  return (
    <>
      <SearchFilters />
      <DepartmentDashboard 
        department={deptName} 
        companyId={companyId} 
        fyId={fyId} 
      />
    </>
  );
}

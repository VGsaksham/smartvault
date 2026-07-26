import CategoryDashboard from "@/components/CategoryDashboard";
import SearchFilters from "@/components/SearchFilters";

export default async function CategoryPage({ 
  params,
  searchParams
}: { 
  params: Promise<{ id: string }>,
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const { id } = await params;
  const sParams = await searchParams;
  
  const masterfolderId = sParams.masterfolderId as string | null;
  const dummyNull = sParams.null as string | null;
  
  // Category name comes from the managed structure; keep route param as-is (no hardcoded transforms).
  const deptName = decodeURIComponent(id);

  return (
    <>
      <SearchFilters />
      <CategoryDashboard 
        category={deptName} 
        masterfolderId={masterfolderId} 
      />
    </>
  );
}

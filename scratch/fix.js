const fs = require('fs');
const files = [
  'src/app/(app)/admin/page.tsx',
  'src/app/(app)/admin/users/page.tsx',
  'src/app/(app)/categories/[id]/page.tsx',
  'src/components/AuditLog.tsx',
  'src/components/CategoryDashboard.tsx',
  'src/components/MainDashboard.tsx',
  'src/components/RecentView.tsx',
  'src/components/SearchFilters.tsx',
  'src/components/TopBar.tsx'
];

for (const file of files) {
  let content = fs.readFileSync(file, 'utf8');
  
  content = content.replace(/, null: null\|\|''/g, '');
  content = content.replace(/null: null\|\|'', /g, '');
  content = content.replace(/, null: null/g, '');
  content = content.replace(/null: null, /g, '');
  
  content = content.replace(/\|\| null/g, '');
  content = content.replace(/\|\|null/g, '');
  
  // also fix masterfolders duplicate in SearchFilters.tsx
  content = content.replace(/masterfolders: masterfolders, masterfolders: masterfolders/g, 'masterfolders: masterfolders');
  content = content.replace(/masterfolders, masterfolders/g, 'masterfolders');
  
  // fix companyId in MainDashboard.tsx
  content = content.replace(/companyId: null, fyId: null/g, '');
  
  fs.writeFileSync(file, content);
}

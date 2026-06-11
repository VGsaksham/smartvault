export function normalizeFolderPath(value: string | null | undefined): string {
  if (!value) return '';
  return String(value).trim().replace(/^\/+|\/+$/g, '');
}

export function folderAliasKey(department: string, folderPath: string | null | undefined): string {
  return `${department}::${normalizeFolderPath(folderPath)}`;
}

export function displayFolderLabel(
  folderPath: string | null | undefined,
  department: string,
  aliases: Record<string, string>
): string {
  const canonical = normalizeFolderPath(folderPath);
  if (!canonical) return 'Root';
  const parts = canonical.split('/');
  return parts
    .map((_, idx) => {
      const partial = parts.slice(0, idx + 1).join('/');
      const key = folderAliasKey(department, partial);
      return aliases[key] || parts[idx];
    })
    .join(' / ');
}

export function displayFolderSegment(
  folderPath: string,
  department: string,
  aliases: Record<string, string>
): string {
  const key = folderAliasKey(department, folderPath);
  if (aliases[key]) return aliases[key];
  const parts = folderPath.split('/');
  return parts[parts.length - 1] || folderPath;
}

export function basenameOf(filePath: string | null, fallback = 'untitled.md'): string {
  if (!filePath) return fallback;
  return filePath.split(/[\\/]/).filter(Boolean).pop() ?? fallback;
}

export function stripMarkdownExt(name: string): string {
  return name.replace(/\.(md|markdown)$/i, '');
}

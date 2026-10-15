/** UI vocabulary only. The CLI wire and permission gate keep their original names. */
const DISPLAY_NAMES: Readonly<Record<string, string>> = {
  read_file: 'Read', write_file: 'Write', edit_file: 'Edit', run_shell: 'Bash',
  search_text: 'Grep', glob_files: 'Glob', web_fetch: 'WebFetch',
};

export function desktopV1Tool(name: string, input: Record<string, unknown> | undefined): {
  readonly name: string; readonly input: Record<string, unknown>;
} {
  const value = input ?? {};
  const fileTool = name === 'read_file' || name === 'write_file' || name === 'edit_file';
  return { name: DISPLAY_NAMES[name] ?? name,
    input: fileTool && typeof value.path === 'string' ? { ...value, file_path: value.path } : value,
  };
}

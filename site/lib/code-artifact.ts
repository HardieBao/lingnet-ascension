export function isCodeArtifactPath(value: unknown): value is string {
  return typeof value === "string" &&
    /^site\/(?:app|lib|db|public)\/[a-zA-Z0-9_./-]+\.(?:ts|tsx|js|mjs)$/.test(value) &&
    !value.split("/").some((segment) => segment === "." || segment === "..");
}

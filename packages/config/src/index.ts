export const workspacePackageNames = [
  "@avatarkit/web",
  "@avatarkit/api",
  "@avatarkit/widget",
  "@avatarkit/ui",
  "@avatarkit/types",
  "@avatarkit/config"
] as const

export type WorkspacePackageName = (typeof workspacePackageNames)[number]

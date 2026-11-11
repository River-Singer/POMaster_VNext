// scripts/sync-geist-shell.mjs 的类型声明（测试里直接调用它核对同步）。
export declare const GEIST_SHELL_COMPONENTS: readonly string[];
export interface ShellAssets {
  readonly files: Readonly<Record<string, string>>;
  readonly globalsCss: string;
}
export declare function deriveGlobalsCss(geistCss: string): string;
export declare function readShellAssets(repo: string): ShellAssets;
export declare function renderAssetsModule(assets: ShellAssets): string;

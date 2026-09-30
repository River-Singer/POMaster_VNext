import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildReconImportSnapshot } from "../src/recon-import-snapshot.js";

describe("recon import snapshot v1",()=>{
  it("同源码/config 稳定；源码与 alias config 漂移分项可判",()=>{
    const root=mkdtempSync(join(tmpdir(),"pomaster-snapshot-"));mkdirSync(join(root,"src"));
    writeFileSync(join(root,"src","a.ts"),"export const a=1;\n");
    writeFileSync(join(root,"tsconfig.json"),JSON.stringify({compilerOptions:{baseUrl:".",paths:{"@/*":["src/*"]}}}));
    const first=buildReconImportSnapshot(root),same=buildReconImportSnapshot(root);
    expect(same).toEqual(first);
    writeFileSync(join(root,"src","a.ts"),"export const a=2;\n");
    const sourceChanged=buildReconImportSnapshot(root);expect(sourceChanged.sourceFilesSha).not.toBe(first.sourceFilesSha);expect(sourceChanged.aliasConfigSha).toBe(first.aliasConfigSha);
    writeFileSync(join(root,"tsconfig.json"),JSON.stringify({compilerOptions:{baseUrl:".",paths:{"@/*":["app/*"]}}}));
    const aliasChanged=buildReconImportSnapshot(root);expect(aliasChanged.aliasConfigSha).not.toBe(first.aliasConfigSha);
  });
});

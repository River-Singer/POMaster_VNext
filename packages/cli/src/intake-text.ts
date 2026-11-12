/**
 * intake-text.ts —— 需求读取的文字归一与相似度（code-spec：requirement-intake §3.3/§3.4）。
 *
 * 身份只认归一后的正文与材料自带的标识，从不认行号；相似度用字二元组（中文没有分词也能比）。
 */

import { createHash } from "node:crypto";

export function sha256Hex(text: string | Uint8Array): string {
  return createHash("sha256").update(text).digest("hex");
}

/** 展示用的归一：NFKC（全角转半角）、去 Markdown 强调与链接、压空白。 */
export function normalizeText(text: string): string {
  return text
    .normalize("NFKC")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\*\*|__|`/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** 锚点用的归一：在 normalizeText 之上去掉全部空白与标点、拉丁字母小写。排版、标点的改动不算变化。 */
export function anchorText(text: string): string {
  return normalizeText(text)
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}]+/gu, "");
}

export function bigrams(text: string): Set<string> {
  const value = anchorText(text);
  const grams = new Set<string>();
  if (value.length === 1) grams.add(value);
  for (let index = 0; index + 1 < value.length; index += 1) grams.add(value.slice(index, index + 2));
  return grams;
}

/** Dice 系数：2|A∩B| / (|A|+|B|)。 */
export function similarity(a: string, b: string): number {
  const left = bigrams(a);
  const right = bigrams(b);
  if (left.size === 0 && right.size === 0) return 1;
  if (left.size === 0 || right.size === 0) return 0;
  let shared = 0;
  for (const gram of left) if (right.has(gram)) shared += 1;
  return (2 * shared) / (left.size + right.size);
}

/** a 的二元组有多少落在 b 里（拆分 / 合并判断用）。 */
export function containment(a: string, b: string): number {
  const left = bigrams(a);
  if (left.size === 0) return 0;
  const right = bigrams(b);
  let shared = 0;
  for (const gram of left) if (right.has(gram)) shared += 1;
  return shared / left.size;
}

/** 下载后缀「(1)」「（2）」不属于名字。 */
export function stripDownloadSuffix(name: string): string {
  return name.replace(/\s*[(（]\d+[)）](?=\.[^.]+$|$)/g, "");
}

/** 名字 → 键：去下载后缀、小写、非字母数字汉字折成短横线。 */
export function slugKey(name: string): string {
  return stripDownloadSuffix(name)
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^a-z0-9一-鿿]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** 模块键去掉序号前缀：04-set-db → set-db（原型页面与模块对应用）。 */
export function moduleCore(key: string): string {
  return key.replace(/^\d+[-_.]+/, "");
}

/** 规范词：SHALL / 必须 / 不得…… 出现即为规则句。 */
export const NORMATIVE = /(SHALL|MUST|SHOULD NOT|必须|不得|禁止|不允许|不能|应当|只能|唯一|须)/;

/** 两段正文的公共前缀长度（锚点归一之后）。「同一主语、谓语改了」的规则靠它认。 */
export function commonPrefix(a: string, b: string): number {
  const left = anchorText(a);
  const right = anchorText(b);
  let index = 0;
  while (index < left.length && index < right.length && left[index] === right[index]) index += 1;
  return index;
}

/** 正文配对分：字二元组相似度；公共前缀至少 6 个字且占较短一方四成以上时，按 0.6 计。 */
export function textPairScore(a: string, b: string): number {
  const dice = similarity(a, b);
  const prefix = commonPrefix(a, b);
  const shorter = Math.min(anchorText(a).length, anchorText(b).length);
  return prefix >= 6 && prefix >= shorter * 0.4 ? Math.max(dice, 0.6) : dice;
}

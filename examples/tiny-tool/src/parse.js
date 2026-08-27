/**
 * parse.js —— 功能一：CSV 文本解析（RFC4180 状态机）。
 *
 * 设计背景：MASTer 08-17 csvEscape 两层×16 份复制事故（failure pattern 已登记为
 * KNOWLEDGE.CSV_FAILURE_PATTERN，alias KB.FAILURE_PATTERN.CSV_NAIVE_SPLIT）。
 * 解析器同步产出五项 failure-pattern 机械检查结果（与 02b §8 checks 清单逐字对应）：
 * quoted_delimiter / embedded_newline / escaped_quote / bom_encoding / trailing_delimiter。
 */
const BOM = "﻿";

/**
 * 解析 CSV 文本。
 * @param {string} text 原始 CSV 文本
 * @param {{ delimiter?: string }} [options]
 * @returns {{ rows: string[][], issues: {check: string, detail: string}[] }}
 */
export function parseCsv(text, { delimiter = "," } = {}) {
  const issues = [];
  let input = String(text ?? "");
  if (input.startsWith(BOM)) {
    issues.push({ check: "bom_encoding", detail: "input starts with UTF-8 BOM; stripped before parsing" });
    input = input.slice(BOM.length);
  }

  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  let sawEscapedQuote = false;
  let quotedDelimiterSeen = false;
  let quotedNewlineSeen = false;
  let lastTokenWasDelimiter = false;
  let i = 0;
  const n = input.length;

  const closeField = () => {
    row.push(field);
    field = "";
  };
  const closeRecord = () => {
    closeField();
    if (lastTokenWasDelimiter && row[row.length - 1] === "") {
      issues.push({ check: "trailing_delimiter", detail: `record ${rows.length + 1} ends with a delimiter; trailing empty cell kept` });
    }
    lastTokenWasDelimiter = false;
    rows.push(row);
    row = [];
  };

  while (i < n) {
    const ch = input[i];
    if (inQuotes) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          sawEscapedQuote = true;
          i += 2;
          continue;
        }
        inQuotes = false;
        if (field.includes(delimiter) && !quotedDelimiterSeen) {
          quotedDelimiterSeen = true;
          issues.push({ check: "quoted_delimiter", detail: "quoted cell contains the delimiter; naive split would corrupt the row" });
        }
        if (field.includes("\n") && !quotedNewlineSeen) {
          quotedNewlineSeen = true;
          issues.push({ check: "embedded_newline", detail: "quoted cell contains a newline; line-based parsing would split the record" });
        }
        i += 1;
        continue;
      }
      field += ch;
      i += 1;
      continue;
    }
    if (ch === '"' && field === "") {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (ch === delimiter) {
      closeField();
      lastTokenWasDelimiter = true;
      i += 1;
      continue;
    }
    if (ch === "\r" || ch === "\n") {
      if (ch === "\r" && input[i + 1] === "\n") i += 1;
      closeRecord();
      i += 1;
      continue;
    }
    field += ch;
    lastTokenWasDelimiter = false;
    i += 1;
  }
  if (inQuotes) {
    issues.push({ check: "unterminated_quote", detail: "input ends inside a quoted cell" });
  }
  if (sawEscapedQuote) {
    issues.push({ check: "escaped_quote", detail: "doubled quotes inside a quoted cell were unescaped (\"\" → \")" });
  }
  if (row.length > 0 || field !== "" || rows.length === 0) {
    closeRecord();
  }
  return { rows, issues };
}

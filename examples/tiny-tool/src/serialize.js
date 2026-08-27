/**
 * serialize.js —— 功能二：CSV 行序列化（正确引号转义）。
 *
 * 反面教材（capacity 对象 payload.forbidden 所禁形态）：
 * - naive_split_on_comma：text.split(",") 直接拆列——遇带逗号的引号单元格即烂行；
 * - manual_quote_concat_without_escaping：手拼 `"${cell}"` 却不把内部 `"` 翻倍——
 *   MASTer 08-17 事故的两层×16 份复制即此形态。
 */
/**
 * 序列化行为 CSV 文本（CRLF 结尾记录，RFC4180）。
 * @param {string[][]} rows 行集合（每行为单元格数组）
 * @param {{ delimiter?: string, forceQuoteAll?: boolean }} [options]
 * @returns {string}
 */
export function serializeRows(rows, { delimiter = ",", forceQuoteAll = false } = {}) {
  const needsQuote = (cell) =>
    forceQuoteAll ||
    cell.includes(delimiter) ||
    cell.includes('"') ||
    cell.includes("\n") ||
    cell.includes("\r");
  const encodeCell = (cell) => {
    const value = String(cell ?? "");
    if (!needsQuote(value)) return value;
    return `"${value.replaceAll('"', '""')}"`;
  };
  const lines = rows.map((row) => row.map(encodeCell).join(delimiter));
  if (lines.length === 0) return "";
  return `${lines.join("\r\n")}\r\n`;
}

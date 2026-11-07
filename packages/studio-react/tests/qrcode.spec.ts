// 二维码编码器（src/lib/qrcode.ts）：与 ISO/IEC 18004 的表对照——格式信息串、版本信息串、容量上限，
// 外加一个已用 OpenCV 解码核对过的完整矩阵快照（"HELLO"，M 级，版本 1，掩模 4）。
import { describe, expect, it } from "vitest";
import { QR_MAX_VERSION, encodeQr } from "../src/lib/qrcode";

const HELLO_M = [
  "#######.##.#..#######",
  "#.....#..##.#.#.....#",
  "#.###.#..####.#.###.#",
  "#.###.#.#..#..#.###.#",
  "#.###.#.#...#.#.###.#",
  "#.....#.#.##..#.....#",
  "#######.#.#.#.#######",
  "........#####........",
  "#...#.######.#####..#",
  "...###..#.###..#.####",
  "#.##..#.#.##..###..#.",
  "###..#...#...##.#....",
  "..#.###..#..###...##.",
  "........###.###..#.##",
  "#######.##..##...#.#.",
  "#.....#....##..#...#.",
  "#.###.#.#..#..###.#.#",
  "#.###.#....##....#.##",
  "#.###.#..###..####...",
  "#.....#..#...##......",
  "#######.#...#####.#.#",
];

function rows(text: string, level: "L" | "M" | "Q" | "H" = "M") {
  return encodeQr(text, level).modules.map((row) => row.map((dark) => (dark ? "#" : ".")).join(""));
}

function formatBits(modules: readonly (readonly boolean[])[]): number {
  const pos: Array<[number, number]> = [];
  for (let i = 0; i <= 5; i++) pos.push([8, i]);
  pos.push([8, 7], [8, 8], [7, 8]);
  for (let i = 9; i < 15; i++) pos.push([14 - i, 8]);
  return pos.reduce((acc, [x, y], i) => acc | ((modules[y]![x] ? 1 : 0) << i), 0);
}

describe("二维码编码", () => {
  it("HELLO（M 级）与核对过的矩阵逐格一致", () => {
    const matrix = encodeQr("HELLO", "M");
    expect(matrix.version).toBe(1);
    expect(matrix.mask).toBe(4);
    expect(rows("HELLO")).toEqual(HELLO_M);
  });

  it("格式信息串与标准表一致（M 级 + 选中的掩模），两份副本相同", () => {
    // ISO/IEC 18004 表 C.1：M 级的 8 个掩模对应的格式信息串（已异或 101010000010010）。
    const M = ["101010000010010", "101000100100101", "101111001111100", "101101101001011", "100010111111001", "100000011001110", "100111110010111", "100101010100000"];
    for (const text of ["HELLO", "https://river-singer.github.io/POMaster_VNext/", "pomaster 设计规范"]) {
      const matrix = encodeQr(text, "M");
      expect(formatBits(matrix.modules)).toBe(Number.parseInt(M[matrix.mask]!, 2));
      const second = Array.from({ length: 15 }, (_, i) => (i < 8 ? matrix.modules[8]![matrix.size - 1 - i] : matrix.modules[matrix.size - 15 + i]![8]) ? 1 : 0);
      expect(second.reduce((acc, bit, i) => acc | (bit << i), 0)).toBe(formatBits(matrix.modules));
    }
  });

  it("版本 7 起带版本信息（版本 7 = 0x07C94），定位图形与定时线在位", () => {
    const matrix = encodeQr("y".repeat(120), "M");
    expect(matrix.version).toBe(7);
    let info = 0;
    for (let i = 0; i < 18; i++) info |= (matrix.modules[Math.floor(i / 3)]![matrix.size - 11 + (i % 3)] ? 1 : 0) << i;
    expect(info).toBe(0x07c94);
    const finder = ["#######", "#.....#", "#.###.#", "#.###.#", "#.###.#", "#.....#", "#######"];
    const at = (x: number, y: number) => finder.map((_, dy) => matrix.modules[y + dy]!.slice(x, x + 7).map((dark) => (dark ? "#" : ".")).join(""));
    expect(at(0, 0)).toEqual(finder);
    expect(at(matrix.size - 7, 0)).toEqual(finder);
    expect(at(0, matrix.size - 7)).toEqual(finder);
    for (let i = 8; i < matrix.size - 8; i++) expect(matrix.modules[6]![i]).toBe(i % 2 === 0);
  });

  it("按内容长度选最小版本；版本 10 的 M 级最多 213 字节，超出报错", () => {
    expect(encodeQr("x".repeat(14), "M").version).toBe(1);
    expect(encodeQr("x".repeat(15), "M").version).toBe(2);
    expect(encodeQr("x".repeat(213), "M").version).toBe(QR_MAX_VERSION);
    expect(() => encodeQr("x".repeat(214), "M")).toThrow(RangeError);
    // UTF-8 下「二维码」是 9 字节，版本 1 的 H 级只装得下 7 字节。
    expect(encodeQr("二维码", "H").version).toBe(2);
  });
});

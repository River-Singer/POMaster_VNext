/**
 * seam-comparator.spec.ts —— mock/real seam 比较核（W5-FR09；契约
 * w5-probe-contract §4 纯函数核矩阵）。
 *
 * 判据锚（契约 §4）：比较维度 shape/nullability、status/error semantics、mutation
 * outcome、state transition、visibility 逐维对账；按 oracle 归一不要求字节相等；
 * 分歧/不可判显式输出；real 形态缺值样本进分母（detail-only 缺值腿必测）。
 * 回放锚：Case E（R3）mutation 分歧（mock 落库/real 仅解析）→ divergent。
 */
import { describe, expect, it } from "vitest";
import {
  SEAM_DIMENSIONS,
  compareSeamObservations,
  type SeamLegObservation,
} from "../src/index.js";

const ORACLE = { visible_via: "api_list", mapping_fields: ["imported_count"] };

function leg(overrides?: Partial<SeamLegObservation>): SeamLegObservation {
  return {
    operation_id: "import-records",
    contract_ref: "OAS.IMPORT@1",
    scenario_ref: "import-persisted",
    shape_fields: [
      { name: "imported_count", type: "integer", nullable: false },
      { name: "failed_count", type: "integer", nullable: false },
    ],
    error_semantics: ["409_CONFLICT", "422_UNPROCESSABLE"],
    mutation: { persisted: true, undoable: true },
    state_transition: "idle→imported",
    visible: true,
    ...overrides,
  };
}

describe("compareSeamObservations（纯函数核——同输入同输出；五维逐一对账）", () => {
  it("维度词形固定五维且顺序稳定（输出字节稳定的对账锚）", () => {
    const result = compareSeamObservations({ mock: leg(), real: leg(), mockLegId: "m", realLegId: "r", oracle: ORACLE });
    expect(result.dimensions.map((row) => row.dimension)).toEqual([...SEAM_DIMENSIONS]);
    expect(result.verdict).toBe("consistent");
  });

  it("Case E（R3）原型：mock 落库 / real 仅解析（shape 相同）→ mutation_outcome divergent", () => {
    const result = compareSeamObservations({
      mock: leg(),
      real: leg({ mutation: { persisted: false, undoable: null } }),
      mockLegId: "project.cdf.runtime.mock",
      realLegId: "project.cdf.runtime.real",
      oracle: ORACLE,
    });
    expect(result.verdict).toBe("divergent");
    const mutation = result.dimensions.find((row) => row.dimension === "mutation_outcome");
    expect(mutation?.outcome).toBe("divergent");
    expect(mutation?.reason).toContain("persisted=true ≠ real persisted=false");
    expect(mutation?.reason).toContain("shape 对称不证明副作用对称");
  });

  it("detail-only 缺值腿：real nullable=true vs mock=false → shape 分歧；oracle 字段缺席=分歧", () => {
    const nullable = compareSeamObservations({
      mock: leg(),
      real: leg({ shape_fields: [{ name: "imported_count", type: "integer", nullable: false }, { name: "failed_count", type: "integer", nullable: true }] }),
      mockLegId: "m", realLegId: "r", oracle: ORACLE,
    });
    expect(nullable.verdict).toBe("divergent");
    expect(nullable.dimensions[0]?.reason).toContain("detail-only 缺值腿分歧");

    const missingOracleField = compareSeamObservations({
      mock: leg({ shape_fields: [{ name: "failed_count", type: "integer", nullable: false }] }),
      real: leg(),
      mockLegId: "m", realLegId: "r", oracle: ORACLE,
    });
    expect(missingOracleField.verdict).toBe("divergent");
    expect(missingOracleField.dimensions[0]?.reason).toContain("oracle mapping_fields");
  });

  it("单腿独有字段 = shape 漂移（mock 承诺超出 real / real 返回 mock 未料的字段）", () => {
    const mockOnly = compareSeamObservations({
      mock: leg({ shape_fields: [...leg().shape_fields, { name: "phantom", type: "string", nullable: false }] }),
      real: leg(),
      mockLegId: "m", realLegId: "r", oracle: ORACLE,
    });
    expect(mockOnly.verdict).toBe("divergent");
    expect(mockOnly.dimensions[0]?.reason).toContain("仅 mock 腿在册");

    const realOnly = compareSeamObservations({
      mock: leg(),
      real: leg({ shape_fields: [...leg().shape_fields, { name: "extra", type: "string", nullable: false }] }),
      mockLegId: "m", realLegId: "r", oracle: ORACLE,
    });
    expect(realOnly.verdict).toBe("divergent");
    expect(realOnly.dimensions[0]?.reason).toContain("仅 real 腿在册");
  });

  it("error semantics / state transition / visibility 分歧与不可判显式（null=undecidable 非绿）", () => {
    const errorDivergent = compareSeamObservations({
      mock: leg(), real: leg({ error_semantics: ["409_CONFLICT"] }),
      mockLegId: "m", realLegId: "r", oracle: ORACLE,
    });
    expect(errorDivergent.verdict).toBe("divergent");
    expect(errorDivergent.dimensions.find((row) => row.dimension === "error_semantics")?.reason).toContain("422_UNPROCESSABLE");

    const stateUndecidable = compareSeamObservations({
      mock: leg(), real: leg({ state_transition: null }),
      mockLegId: "m", realLegId: "r", oracle: ORACLE,
    });
    expect(stateUndecidable.verdict).toBe("undecidable");
    expect(stateUndecidable.dimensions.find((row) => row.dimension === "state_transition")?.outcome).toBe("undecidable");

    const visibilityDivergent = compareSeamObservations({
      mock: leg(), real: leg({ visible: false }),
      mockLegId: "m", realLegId: "r", oracle: ORACLE,
    });
    expect(visibilityDivergent.verdict).toBe("divergent");
    expect(visibilityDivergent.dimensions.find((row) => row.dimension === "visibility")?.reason).toContain("oracle 通道=api_list");

    const noOracle = compareSeamObservations({ mock: leg(), real: leg(), mockLegId: "m", realLegId: "r", oracle: null });
    expect(noOracle.verdict).toBe("undecidable");
    expect(noOracle.dimensions.find((row) => row.dimension === "visibility")?.reason).toContain("oracle 缺席");
  });

  it("身份断裂（operation/scenario 不一致）= mutation 维度显式分歧（非同一义务的两腿）", () => {
    const result = compareSeamObservations({
      mock: leg(), real: leg({ operation_id: "other-operation" }),
      mockLegId: "m", realLegId: "r", oracle: ORACLE,
    });
    expect(result.verdict).toBe("divergent");
    const mutation = result.dimensions.find((row) => row.dimension === "mutation_outcome");
    expect(mutation?.reason).toContain("身份断裂");
  });
});

import { describe, it, expect } from "vitest";
import {
  gradeRelationshipRisk,
  auditWindowAxis,
  waiverEstoppelAxis,
} from "./risk";

describe("relationship-risk grading", () => {
  it("grades a clean, in-window, low-churn finding as A → retroactive claim", () => {
    const g = gradeRelationshipRisk({
      entitlement: 1,
      auditWindow: 1,
      waiverEstoppel: 1,
      relationship: 1,
    });
    expect(g.grade).toBe("A");
    expect(g.action).toBe("retroactive_claim");
  });

  it("drops a strong clause to B when you knowingly under-billed for years", () => {
    // Explicit entitlement + in window, but high waiver/estoppel risk.
    const g = gradeRelationshipRisk({
      entitlement: 1,
      auditWindow: 1,
      waiverEstoppel: 0.2,
      relationship: 1,
    });
    expect(g.grade).toBe("B");
    expect(g.action).toBe("negotiate_partial");
  });

  it("forces forward-only (C) on weak entitlement", () => {
    const g = gradeRelationshipRisk({
      entitlement: 0.3,
      auditWindow: 1,
      waiverEstoppel: 1,
      relationship: 1,
    });
    expect(g.grade).toBe("C");
    expect(g.action).toBe("forward_only");
  });

  it("forces forward-only (C) when the relationship is strategic (high churn risk)", () => {
    const g = gradeRelationshipRisk({
      entitlement: 1,
      auditWindow: 1,
      waiverEstoppel: 1,
      relationship: 0.1,
    });
    expect(g.grade).toBe("C");
  });

  it("grades a middling finding as B", () => {
    const g = gradeRelationshipRisk({
      entitlement: 0.6,
      auditWindow: 0.6,
      waiverEstoppel: 0.6,
      relationship: 0.6,
    });
    expect(g.grade).toBe("B");
  });

  it("persists the axis values as riskFactors", () => {
    const g = gradeRelationshipRisk({
      entitlement: 0.8,
      auditWindow: 0.7,
      waiverEstoppel: 0.9,
      relationship: 0.5,
    });
    expect(g.factors).toEqual({
      entitlement: 0.8,
      auditWindow: 0.7,
      waiverEstoppel: 0.9,
      relationship: 0.5,
    });
  });
});

describe("risk axis helpers", () => {
  it("auditWindowAxis = share of the arrears period inside the window", () => {
    expect(auditWindowAxis(60, 24)).toBeCloseTo(0.4, 5);
    expect(auditWindowAxis(12, 24)).toBe(1);
    expect(auditWindowAxis(0, 24)).toBe(1);
  });

  it("waiverEstoppelAxis decays with months of silent under-billing", () => {
    expect(waiverEstoppelAxis(12)).toBe(1);
    expect(waiverEstoppelAxis(36)).toBeCloseTo(0.6, 5);
    expect(waiverEstoppelAxis(60)).toBeCloseTo(0.2, 5);
  });
});

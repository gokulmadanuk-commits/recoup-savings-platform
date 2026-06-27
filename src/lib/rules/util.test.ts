import { describe, it, expect } from "vitest";
import { similarity, normalizeEntity, normalizeInvoiceNumber, matchRateCardLine } from "./util";
import { RateCardLineSchema } from "../types";
import { toCents } from "../money";

describe("rule utilities", () => {
  it("similarity is 1 for identical, lower for different", () => {
    expect(similarity("Professional Seat License", "Professional Seat License")).toBe(1);
    expect(similarity("INV-1024", "INV1024")).toBeGreaterThan(0.8);
    expect(similarity("apples", "oranges")).toBeLessThan(0.5);
  });

  it("normalizeEntity strips legal suffixes/punctuation", () => {
    expect(normalizeEntity("Acme, Inc.")).toBe(normalizeEntity("Acme LLC"));
    expect(normalizeEntity("Brightseat CRM Inc.")).toBe("brightseat crm");
  });

  it("normalizeInvoiceNumber ignores punctuation/case", () => {
    expect(normalizeInvoiceNumber("inv-1024")).toBe("INV1024");
  });

  it("matchRateCardLine resolves exact SKU with full confidence", () => {
    const rateCard = [
      RateCardLineSchema.parse({ sku: "CRM-SEAT", description: "Professional Seat License", uom: "seat", unitPriceCents: toCents(45) }),
    ];
    const m = matchRateCardLine(rateCard, { sku: "CRM-SEAT", description: "Pro Seat", uom: "seat" });
    expect(m.rate?.sku).toBe("CRM-SEAT");
    expect(m.confidence).toBe(1);
  });

  it("matchRateCardLine falls back to fuzzy description match", () => {
    const rateCard = [
      RateCardLineSchema.parse({ sku: "CRM-SEAT", description: "Professional Seat License", uom: "seat", unitPriceCents: toCents(45) }),
    ];
    const m = matchRateCardLine(rateCard, { sku: null, description: "Professional Seat Licence", uom: "seat" });
    expect(m.rate?.sku).toBe("CRM-SEAT");
    expect(m.confidence).toBeGreaterThanOrEqual(0.85);
  });
});

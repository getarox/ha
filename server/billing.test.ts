import { describe, expect, it } from "vitest";
import { NEURON_PACKAGES, packageInfo, shouldCreditNeuronPackage, validateNeuronPackageCallback } from "./billing.js";

describe("fixed Neuron packages", () => {
  it("uses only the five approved USD price and Neuron amounts", () => {
    expect(Object.values(NEURON_PACKAGES).map(({ price, neurons }) => [price, neurons])).toEqual([
      [10, 272727], [20, 545455], [30, 818182], [40, 1090909], [50, 1363636],
    ]);
    expect(packageInfo("eco")?.name).toBe("إيكو");
    expect(packageInfo("business")?.name).toBe("بزنز");
    expect(packageInfo("free")).toBeUndefined();
  });

  it("validates PayTabs package callbacks against the persisted amount and USD currency", () => {
    const responseStatus = validateNeuronPackageCallback({ amountUsd: "20.00" }, {
      cart_amount: 20,
      cart_currency: "USD",
      payment_result: { response_status: "A" },
    });
    expect(responseStatus).toBe("A");
    expect(() => validateNeuronPackageCallback({ amountUsd: 20 }, { cart_amount: 20, cart_currency: "SAR", respStatus: "A" })).toThrow(/عملة الدفع/);
    expect(() => validateNeuronPackageCallback({ amountUsd: 20 }, { cart_amount: 10, cart_currency: "USD", respStatus: "A" })).toThrow(/مبلغ أو عملة/);
  });

  it("credits only the first pending-to-paid transition", () => {
    expect(shouldCreditNeuronPackage("pending", [{ affectedRows: 1 }])).toBe(true);
    expect(shouldCreditNeuronPackage("pending", [{ affectedRows: 0 }])).toBe(false);
    expect(shouldCreditNeuronPackage("paid", [{ affectedRows: 1 }])).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import {
  exceedsVariance,
  hasExactDuplicate,
  isBalanced,
  nextVoucherNumber,
  postedEditStatus,
} from "@/lib/accounting-rules";

describe("accounting rules", () => {
  it("accepts equal debits and credits", () =>
    expect(
      isBalanced([
        { debit: 100, credit: 0 },
        { debit: 0, credit: 100 },
      ]),
    ).toBe(true));
  it("rejects an imbalanced voucher", () =>
    expect(
      isBalanced([
        { debit: 100, credit: 0 },
        { debit: 0, credit: 99.99 },
      ]),
    ).toBe(false));
  it("increments only the selected voucher type and year", () =>
    expect(
      nextVoucherNumber(
        ["JV-2025-0002", "JV-2024-0099", "RV-2025-0010"],
        "JV",
        "2025",
      ),
    ).toBe("JV-2025-0003"));
  it("flags exact same-day account amount duplicates", () =>
    expect(
      hasExactDuplicate(500, "2025-01-01", "cash", [
        { amount: 500, date: "2025-01-01", accountId: "cash" },
      ]),
    ).toBe(true));
  it("flags amounts above 200 percent of the historical average", () =>
    expect(exceedsVariance(250, [100, 100, 100])).toBe(true));
  it("keeps posted voucher edits posted", () =>
    expect(postedEditStatus("posted", true)).toBe("posted"));
});

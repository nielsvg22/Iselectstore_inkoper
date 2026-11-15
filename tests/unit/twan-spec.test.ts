import { describe, expect, it } from "vitest";
import { batteryDeductionEuro } from "@/lib/rules/battery";
import { allowedPrices } from "@/lib/rules/margin";

// Letterlijk zoals Twan ze heeft aangeleverd
const BATTERY_TWAN: Record<number, number> = {
  80: -140, 81: -140, 82: -140, 83: -140, 84: -140, 85: -140, 86: -135, 87: -130, 88: -125, 89: -120, 90: -110,
  91: -95, 92: -80, 93: -70, 94: -70, 95: -60, 96: -50, 97: -40, 98: -30, 99: -20, 100: 0,
};
const MARGIN_TEXT = `
0-49               45    55    20
50-99             50    60    25
100-149          60    75    25
150-199          70    80    30
200-249.        80    90    30
250-299         80    95    30
300-349         80   105    35
350-399         85   115    40
400-449.        90   115    45
450-499         95   125    50
500-549       100   130    50
550-599        110   140    50
600-649       120   150    50
650-699       130   160    50
700-749        135   165    60
750-799        150   180    60
800-849       155   190    70
850-899       165   205    70
900-949       175   215    90
950-999       190   240    90
1000-1049    205   250   100
1050-1099    215   265   100
1100-1149     215   275   100
1150-1199     230   295   105
1200-1249   235   300   110
1250-1299   240   320   115
1300-1349   240   325   120
1350-1399   245   335   130
1400+           245   335   140`;
const rows = MARGIN_TEXT.trim().split("\n").map((l) => { const [cls, vraag, bieden, extra] = l.trim().split(/\s+/); return { from: parseInt(cls, 10), vraag: +vraag, bieden: +bieden, extra: +extra }; });
const cfg = { marginTable: "TWAN" as const, highMarginBidMode: "same" as const };

describe("Twans aangeleverde tabellen, letterlijk", () => {
  it("batterijaftrek: elke procent komt exact overeen", () => {
    for (const [pct, euro] of Object.entries(BATTERY_TWAN)) expect(batteryDeductionEuro(Number(pct), "twan"), `${pct}%`).toBe(euro === 0 ? 0 : -euro);
  });
  it("29 klassen; vraag, bieden en extra kloppen in de hele klasse (eerste en laatste euro)", () => {
    expect(rows).toHaveLength(29);
    rows.forEach((r, i) => {
      const last = i + 1 < rows.length ? rows[i + 1].from - 0.01 : 5000;
      for (const sell of [r.from, last]) {
        const a = allowedPrices(sell, cfg);
        expect(a.askMargin, `vraag ${sell}`).toBe(r.vraag);
        expect(a.bidMargin, `bieden ${sell}`).toBe(r.bieden);
        expect(a.askHigh, `extra ${sell}`).toBe(r.extra);
        expect(a.bidHigh, `extra bieden ${sell}`).toBe(r.extra);
      }
    });
  });
});

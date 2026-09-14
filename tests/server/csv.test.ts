import { describe, expect, it } from "vitest";
import { toCsv } from "~server/csv.js";

describe("toCsv", () => {
  it("prefixes a leading-formula-character value with a single quote", () => {
    const csv = toCsv(["notes"], [['=HYPERLINK("http://evil.example")']]);
    const dataLine = csv.split("\r\n")[1];
    expect(dataLine).toBe(`"'=HYPERLINK(""http://evil.example"")"`);
  });

  it("prefixes +, -, and @ leads the same way", () => {
    expect(toCsv(["n"], [["+1+1"]]).split("\r\n")[1]).toBe("'+1+1");
    expect(toCsv(["n"], [["-1-1"]]).split("\r\n")[1]).toBe("'-1-1");
    expect(toCsv(["n"], [["@SUM(1)"]]).split("\r\n")[1]).toBe("'@SUM(1)");
  });

  it("leaves an ordinary value untouched", () => {
    expect(toCsv(["n"], [["Bein Tag"]]).split("\r\n")[1]).toBe("Bein Tag");
  });

  it("still quotes a value containing a comma, independent of the formula prefix", () => {
    expect(toCsv(["n"], [["a,b"]]).split("\r\n")[1]).toBe('"a,b"');
  });
});

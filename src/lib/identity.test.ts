import { describe, expect, it } from "vitest";
import { parseIdentity } from "./identity";

const key = (input: string, cc?: string) => {
  const parsed = parseIdentity(input, cc);
  return parsed.ok ? parsed.key : parsed.error;
};

describe("parseIdentity", () => {
  it("matches the same mobile number however it is typed", () => {
    expect(key("98765 43210")).toBe("+919876543210");
    expect(key("098765-43210")).toBe("+919876543210");
    expect(key("+91 98765 43210", "44")).toBe("+919876543210");
    expect(key("0091 9876543210", "1")).toBe("+919876543210");
  });

  it("uses the selected country code", () => {
    expect(key("7700 900123", "44")).toBe("+447700900123");
    expect(key("07700 900123", "44")).toBe("+447700900123");
    expect(key("98012 34567", "977")).toBe("+9779801234567");
  });

  it("normalises emails and usernames", () => {
    expect(key(" Ravi@Example.COM ")).toBe("ravi@example.com");
    expect(key("@Court_1")).toBe("@court_1");
    expect(key("court_1")).toBe("@court_1");
  });

  it("rejects bad input", () => {
    expect(key("123")).toMatch(/too short/);
    expect(key("ravi@")).toMatch(/email/);
    expect(key("a b")).toMatch(/Usernames/);
  });
});

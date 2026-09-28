import { describe, it, expect } from "vitest";
import { GraphError, mapGraphError } from "../graph";

const err = (code: number) => new GraphError("x", 400, code, null, null);

describe("mapGraphError", () => {
  it.each([
    [131026, "not_on_whatsapp"],
    [131030, "recipient_not_allowed"],
    [132001, "template_not_approved"],
    [132012, "template_not_approved"],
    [190, "session_logged_out"],
    [10, "session_logged_out"],
    [200, "session_logged_out"],
    [130429, "rate_limited"],
    [131056, "rate_limited"],
    [4, "rate_limited"],
    [133010, "session_disconnected"],
    [131000, "unknown"],
  ])("maps %i to %s", (code, expected) => {
    expect(mapGraphError(err(code))).toBe(expected);
  });

  it("treats non-Graph errors as unknown", () => {
    expect(mapGraphError(new Error("network down"))).toBe("unknown");
  });

  it("includes Meta's detail in userMessage", () => {
    expect(new GraphError("Invalid parameter", 400, 100, null, "to is invalid").userMessage).toBe(
      "Invalid parameter — to is invalid",
    );
  });
});

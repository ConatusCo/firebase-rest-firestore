import { afterEach, describe, expect, it, vi } from "vitest";
import { createFirestoreClient } from "../src/client";
import { escapeFieldPath } from "../src/utils/converter";

/**
 * Pure unit tests for query field path escaping. No emulator or credentials:
 * `fetch` is stubbed and the structured query request body is inspected.
 */
describe("escapeFieldPath", () => {
  it("leaves simple paths unchanged", () => {
    expect(escapeFieldPath("name")).toBe("name");
    expect(escapeFieldPath("address.city")).toBe("address.city");
    expect(escapeFieldPath("__name__")).toBe("__name__");
  });

  it("quotes segments that are not simple names", () => {
    expect(escapeFieldPath("@type")).toBe("`@type`");
    expect(escapeFieldPath("sort-key")).toBe("`sort-key`");
    expect(escapeFieldPath("1st")).toBe("`1st`");
  });

  it("escapes each segment of a dotted path", () => {
    expect(escapeFieldPath("meta.source-id")).toBe("meta.`source-id`");
    expect(escapeFieldPath("@graph.@type")).toBe("`@graph`.`@type`");
  });

  it("keeps already-quoted segments as-is", () => {
    expect(escapeFieldPath("`@type`")).toBe("`@type`");
    expect(escapeFieldPath("meta.`source-id`")).toBe("meta.`source-id`");
    expect(escapeFieldPath("`a.b`.c")).toBe("`a.b`.c");
    expect(escapeFieldPath("`a\\`b`")).toBe("`a\\`b`");
  });
});

describe("structured query field paths", () => {
  const client = createFirestoreClient({
    projectId: "demo-test-project",
    privateKey: "",
    clientEmail: "",
    useEmulator: true,
    emulatorHost: "127.0.0.1",
    emulatorPort: 8089,
  });

  // Run a query against a stubbed fetch and return the structuredQuery it sent.
  const sentQuery = async (run: () => Promise<unknown>) => {
    const fetchMock = vi.fn(
      async (_url: string, _init: RequestInit) => new Response("[]", { status: 200 })
    );
    vi.stubGlobal("fetch", fetchMock);
    await run();
    const [, init] = fetchMock.mock.calls[0];
    return JSON.parse(init.body as string).structuredQuery;
  };

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("escapes a single where field", async () => {
    const query = await sentQuery(() =>
      client.collection("things").where("@type", "==", "Person").get()
    );
    expect(query.where.fieldFilter.field.fieldPath).toBe("`@type`");
  });

  it("escapes every field of a composite where", async () => {
    const query = await sentQuery(() =>
      client
        .collection("things")
        .where("deleted", "==", false)
        .where("meta.source-id", "==", "x")
        .get()
    );
    const paths = query.where.compositeFilter.filters.map(
      (f: any) => f.fieldFilter.field.fieldPath
    );
    expect(paths).toEqual(["deleted", "meta.`source-id`"]);
  });

  it("escapes an orderBy field on a collection group", async () => {
    const query = await sentQuery(() =>
      client.collectionGroup("things").orderBy("sort-key", "desc").get()
    );
    expect(query.orderBy[0].field.fieldPath).toBe("`sort-key`");
  });

  it("keeps a pre-escaped where field", async () => {
    const query = await sentQuery(() =>
      client.collection("things").where("`@type`", "==", "Person").get()
    );
    expect(query.where.fieldFilter.field.fieldPath).toBe("`@type`");
  });
});

import { createHash } from "node:crypto";
import { readFileSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = new URL("../../", import.meta.url);
const vendor = new URL("vendor/multipart-stream/", root);
const json = (url) => JSON.parse(readFileSync(url, "utf8"));
const sha256 = (file) => createHash("sha256")
  .update(readFileSync(new URL(file, vendor), "utf8").replace(/\r\n/g, "\n")).digest("hex");

describe("DEC-015 pinned multipart source provenance", () => {
  it("resolves the API dependency to the reviewed local package", () => {
    const require = createRequire(new URL("services/api/package.json", root));
    expect(realpathSync(require.resolve("@ubercode/multipart-stream/package.json")))
      .toBe(realpathSync(fileURLToPath(new URL("package.json", vendor))));
    expect(json(new URL("package.json", vendor))).toMatchObject({
      version: "1.1.0-mediq.1", private: true, license: "MIT", dependencies: { streamsearch: "1.1.0" },
    });
    expect(json(new URL("services/api/package.json", root)).dependencies["@ubercode/multipart-stream"])
      .toBe("file:../../vendor/multipart-stream");
  });

  it("pins the single executable correction and retains upstream types and license", () => {
    expect(sha256("index.js")).toBe("3574331e86ab1cde0a4def60895b212e5edb7b345f7cab03990ebe8b560b5c5d");
    expect(sha256("index.d.ts")).toBe("24ef355ba9019c5af1ac0ccf8aa6b8337aec97b62550f7968fc3730e547e6fe5");
    expect(sha256("LICENSE")).toBe("de750a3e6ff28b8f0d4e36d8b8778c976a702d5aa8e08dd56646fc7db41ebcc4");
  });

  it("keeps lockfile resolution local and includes the vendor in both Docker stages", () => {
    const lock = json(new URL("package-lock.json", root));
    expect(lock.packages["services/api/node_modules/@ubercode/multipart-stream"])
      .toEqual({ resolved: "vendor/multipart-stream", link: true });
    expect(lock.packages["vendor/multipart-stream"].version).toBe("1.1.0-mediq.1");
    const dockerfile = readFileSync(new URL("services/api/Dockerfile", root), "utf8");
    expect(dockerfile.match(/COPY vendor\/multipart-stream vendor\/multipart-stream/g)).toHaveLength(2);
  });
});

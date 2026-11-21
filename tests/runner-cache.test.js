const assert = require("assert");
const E = require("../routine-runner-embed.js");

for (const name of ["routine-runner-state.yaml", "schedule-runner-state.yaml"]) {
  assert.equal(E.cachePath(undefined, "Runner", name), `Runner/cache/${name}`);
  assert.equal(E.cachePath(undefined, "", name), `cache/${name}`);
  assert.equal(E.cachePath("private/runner-cache", "Runner", name), `private/runner-cache/${name}`);
  assert.equal(E.cachePath("", "Runner", name), name);
  assert.equal(E.cachePath("/private//cache/", "Runner", name), `private/cache/${name}`);
  assert.throws(() => E.cachePath("../outside", "Runner", name), /inside the vault/);
  assert.throws(() => E.cachePath("C:\\outside", "Runner", name), /inside the vault/);
}

(async () => {
  const folders = new Set();
  const created = [];
  const app = { vault: {
    getAbstractFileByPath: path => folders.has(path) ? { path } : null,
    createFolder: async path => {
      const parent = path.slice(0, path.lastIndexOf("/"));
      if (path.includes("/")) assert(folders.has(parent));
      folders.add(path); created.push(path);
    },
  } };
  await E.ensureCacheFolder(app, "private/cache/routine-runner-state.yaml");
  await E.ensureCacheFolder(app, "private/cache/schedule-runner-state.yaml");
  assert.deepEqual(created, ["private", "private/cache"]);
  await E.ensureCacheFolder(app, "routine-runner-state.yaml");
  assert.equal(created.length, 2, "Vault root requires no folder creation");
  app.vault.createFolder = async path => { folders.add(path); throw new Error("Already exists"); };
  await E.ensureCacheFolder(app, "synced/cache/schedule-runner-state.yaml");
  app.vault.createFolder = async () => { throw new Error("Permission denied"); };
  await assert.rejects(E.ensureCacheFolder(app, "blocked/state.yaml"), /Permission denied/);
  console.log("runner cache paths and folder creation: all tests passed");
})().catch(error => { console.error(error); process.exitCode = 1; });

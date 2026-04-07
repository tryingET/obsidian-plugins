/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "no-circular",
      severity: "error",
      from: {},
      to: { circular: true },
    },
    {
      name: "model-is-foundational",
      severity: "error",
      from: { path: "^src/model" },
      to: { path: "^src/(adapter|domain|commands|state|ui)" },
    },
    {
      name: "domain-only-on-model",
      severity: "error",
      from: { path: "^src/domain" },
      to: { path: "^src/(adapter|commands|state|ui)" },
    },
    {
      name: "commands-are-pure",
      severity: "error",
      from: { path: "^src/commands" },
      to: { path: "^src/(adapter|state|ui)" },
    },
    {
      name: "ui-does-not-touch-adapter",
      severity: "error",
      from: { path: "^src/ui" },
      to: { path: "^src/adapter" },
    },
  ],
  options: {
    doNotFollow: {
      path: "node_modules",
    },
    tsConfig: {
      fileName: "tsconfig.json",
    },
  },
}

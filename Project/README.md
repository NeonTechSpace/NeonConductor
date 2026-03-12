# NeonConductor

## Tooling Notes

### Vite 8 + React Compiler

This project stays on `vite@8` and uses the Rolldown-based React Compiler path:

```ts
react(),
await babel({ presets: [reactCompilerPreset()] }),
```

in [vite.config.ts](/m:/Neonsy/Projects/NeonConductor/Project/vite.config.ts).

### Local pnpm patch

The repo carries a local `pnpm patch` for `@rolldown/plugin-babel@0.1.8`.

Reason:
- the published `dist/index.d.mts` types incorrectly make several Babel plugin options required
- the package README and runtime support the minimal `babel({ presets: [...] })` shape
- without the patch, TypeScript rejects the documented React Compiler configuration even though it works at runtime

Patch behavior:
- `InnerTransformOptions` is changed from `Pick<...>` to `Partial<Pick<...>>`
- this restores the expected optional Babel option surface and lets `vite.config.ts` stay clean

If upstream fixes the typing bug, remove the local patch and the `pnpm.patchedDependencies` entry.

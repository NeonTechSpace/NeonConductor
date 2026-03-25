# NeonConductor

## Tooling Notes

### Vite 8 + React Compiler

This project stays on `vite@8` and uses the Rolldown-based React Compiler path:

```ts
react(),
await babel({ presets: [reactCompilerPreset()] }),
```

in [vite.config.ts](./vite.config.ts).

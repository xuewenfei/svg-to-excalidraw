---
layout: home
---

# headless-svg-to-excalidraw

Library to convert SVG to Excalidraw's file format.

A headless fork of [@excalidraw/svg-to-excalidraw](https://github.com/excalidraw/svg-to-excalidraw) — kept up to date, written in TypeScript, no browser dependencies.

## Installation

```bash
bun add headless-svg-to-excalidraw
# or
npm install headless-svg-to-excalidraw
```

## Usage

```typescript
import { convert } from "headless-svg-to-excalidraw";

const heartSVG = `
<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
  <path d="M 10,30
           A 20,20 0,0,1 50,30
           A 20,20 0,0,1 90,30
           Q 90,60 50,90
           Q 10,60 10,30 z"/>
</svg>
`;

const { hasErrors, errors, content } = convert(heartSVG);

if (hasErrors) {
  console.error(errors);
} else {
  console.log(content);
}
```

## Links

- [GitHub Repository](https://github.com/awhiteside1/headless-svg-to-excalidraw)
- [npm Package](https://www.npmjs.com/package/headless-svg-to-excalidraw)

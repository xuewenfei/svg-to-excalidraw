# svg-to-excalidraw

Library to convert SVG to Excalidraw's file format.

> This is a shameless fork of [@excalidraw/svg-to-excalidraw](https://github.com/excalidraw/svg-to-excalidraw) with the intent of keeping it up to date, using TypeScript, and removing browser dependencies.

## :floppy_disk: Installation

```bash
bun add headless-svg-to-excalidraw
# or
npm install headless-svg-to-excalidraw
# or
yarn add headless-svg-to-excalidraw
```

## :beginner: Usage

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

// SVG parsing errors are propagated through.
if (hasErrors) {
  console.error(errors);
  return;
}

// Write to file or use however you need
console.log(content);
```

## :game_die: Running tests

TODO.

### :building_construction: Local Development

#### Building the Project

```bash
bun run build

# Type checking
bun run typecheck
```

## :busts_in_silhouette: Contributing

Pull requests are welcome. For major changes, please open an issue first to discuss what you would like to change.

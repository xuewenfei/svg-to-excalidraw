# Claude Onboarding


This is a modern, ESM, Typescript fullstack application which prefers
- infered, but strict typing
- small, loosly coupled, well named, maintainable modules.
- behavior driven / reasonable testing of module apis
- simple, modern, well designed architectures
- Does not care about being backwards compatible. Maintainability is more important, there are no dependent projects.

## Development Patterns

- As you make changes, typecheck regularly using `bun run typecheck`
- If you are in a cloud environment, or run into many errors, run `bun install`
- Before you commit or are done with a task, run `bun run lint` and fix any errors.
- Add files to git when you create them and commit when you are done with a task.
- Some changes require updating the database schema to compile or test. You are capable of running those commands.


## Use Bun

Default to using Bun instead of Node.js.

- Install packages with `bun add <package>`
- Use `bun <file>` instead of `node <file>` or `ts-node <file>`
- Use `bun test` instead of `jest` or `vitest`
- Use `bun build <file.html|file.ts|file.css>` instead of `webpack` or `esbuild`
- Use `bun install` instead of `npm install` or `yarn install` or `pnpm install`
- Use `bun run <script>` instead of `npm run <script>` or `yarn run <script>` or `pnpm run <script>`
- Bun automatically loads .env, so don't use dotenv.

- Prefer `Bun.file` over `node:fs`'s readFile/writeFile
- Bun.$`ls` instead of execa.

### Testing

Use `bun test` to run tests.

```ts#index.test.ts
import { describe, it,  expect } from "bun:test";

describe("hello world", () => {
it("works",()=>{
  expect(1).toBe(1);
  })
});
```

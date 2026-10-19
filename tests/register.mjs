// Teaches Node's module loader the project's "@/" path alias (see tsconfig
// "paths") so the tests can run the TypeScript sources directly:
//   node --import ./tests/register.mjs --test ...
import { register } from "node:module";

register("./resolve-alias.mjs", import.meta.url);

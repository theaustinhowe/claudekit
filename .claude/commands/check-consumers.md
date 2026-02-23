Find all apps and packages that import a given `@claudekit/*` package.

The user will provide the package name: $ARGUMENTS

Search across the monorepo for imports of this package. Check:
1. `package.json` dependencies and devDependencies in `apps/` and `packages/`
2. Source code imports (`from "@claudekit/..."` or `require("@claudekit/...")`)

Present results as a list of consumers grouped by type (apps vs packages), showing where the dependency is declared and which source files import from it.

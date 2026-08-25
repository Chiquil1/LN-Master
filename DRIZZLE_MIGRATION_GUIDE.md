# Drizzle ORM Migration Guide: Beta → Stable (v1.0)

## Current State

- `drizzle-orm`: `1.0.0-beta.22`
- `drizzle-kit`: `1.0.0-beta.20`

## Breaking Changes in v1.0 (Expected)

Based on Drizzle ORM [changelog](https://github.com/drizzle-team/drizzle-orm/releases) and migration docs:

### 1. Driver API Changes

- `drizzle-orm/op-sqlite` may have API changes
- Migration runner API may change

### 2. Schema Definition

- `sqliteTable` / `integer` / `text` imports may move
- Index/unique syntax may change

### 3. Query API

- `.execute()` vs `.all()` / `.get()` / `.run()` changes
- Transaction API changes

### 4. Migration Format

- Migration file format may change
- `drizzle-kit` config format changes

## Migration Steps

### Phase 1: Preparation

```bash
# 1. Check current schema
pnpm run generate:db-migration  # Generate current migration

# 2. Backup database
# Copy android/app/files/SQLite/lnreader.db

# 3. Read release notes
# https://github.com/drizzle-team/drizzle-orm/releases/tag/v1.0.0
```

### Phase 2: Update Dependencies

```bash
# Update to stable
pnpm add drizzle-orm@latest drizzle-kit@latest

# Update related
pnpm add @op-engineering/op-sqlite@latest
```

### Phase 3: Code Changes

#### 3.1 Schema imports (src/database/schema/)

```typescript
// Before (beta)
import {
  sqliteTable,
  integer,
  text,
  index,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

// After (stable) - check actual v1.0 imports
import {
  sqliteTable,
  integer,
  text,
  index,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';
```

#### 3.2 Database setup (src/database/db.ts)

```typescript
// Before
import { drizzle } from 'drizzle-orm/op-sqlite';
import { migrate } from 'drizzle-orm/op-sqlite/migrator';

// After - may change to:
import { drizzle } from 'drizzle-orm/op-sqlite';
import { migrate } from 'drizzle-orm/op-sqlite/migrator';
```

#### 3.3 Migration runner

```typescript
// Check if migrate() API changed
await migrate(drizzleDb, { migrationsFolder: './drizzle/migrations' });
```

### Phase 4: Regenerate Migrations

```bash
# 1. Delete old migrations (backup first!)
rm -rf drizzle/migrations

# 2. Generate fresh
pnpm run generate:db-migration

# 3. Update migration format if needed
pnpm run upgrade:migration-format
```

### Phase 5: Testing

```bash
# Run all tests
pnpm run test

# Specifically DB tests
pnpm run test:db

# Test on device
pnpm run dev:android
```

## Risk Mitigation

1. **Run in parallel** - Keep beta branch until stable verified
2. **Database backup** - Auto-backup before migration runs
3. **Feature flags** - Toggle between old/new ORM if needed
4. **Staged rollout** - Test with subset of users first

## Timeline Estimate

- **Low risk**: 1-2 days (if minimal breaking changes)
- **Medium risk**: 1 week (if schema/query API changes)
- **High risk**: 2+ weeks (if major architectural changes)

## Resources

- [Drizzle ORM v1.0 Release Notes](https://github.com/drizzle-team/drizzle-orm/releases/tag/v1.0.0)
- [Migration Guide](https://orm.drizzle.team/docs/migrations)
- [op-sqlite Driver](https://github.com/op-engineering/op-sqlite)

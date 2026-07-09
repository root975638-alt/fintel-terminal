/**
 * Minimal ambient type declarations for Node's built-in `node:sqlite` module
 * (stable/experimental since Node 22.5). @types/node does not yet ship types for
 * this module at the pinned Node types version, so we declare the subset of the
 * API this codebase actually uses. Remove this once @types/node catches up.
 */
declare module "node:sqlite" {
  export interface StatementResultingChanges {
    changes: number | bigint;
    lastInsertRowid: number | bigint;
  }

  export class StatementSync {
    run(...params: unknown[]): StatementResultingChanges;
    get(...params: unknown[]): Record<string, unknown> | undefined;
    all(...params: unknown[]): Record<string, unknown>[];
    iterate(...params: unknown[]): IterableIterator<Record<string, unknown>>;
  }

  export interface DatabaseSyncOptions {
    open?: boolean;
    readOnly?: boolean;
    enableForeignKeyConstraints?: boolean;
  }

  export class DatabaseSync {
    constructor(location: string, options?: DatabaseSyncOptions);
    open(): void;
    close(): void;
    exec(sql: string): void;
    prepare(sql: string): StatementSync;
  }
}

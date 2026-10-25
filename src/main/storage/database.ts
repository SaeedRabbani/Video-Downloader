import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from './migrations';

export class SqliteDatabase {
  public readonly db: DatabaseSync;
  public readonly dbFilePath: string;

  constructor(dbFilePath: string) {
    this.dbFilePath = dbFilePath;
    if (dbFilePath !== ':memory:') {
      fs.mkdirSync(path.dirname(dbFilePath), { recursive: true });
    }
    this.db = new DatabaseSync(dbFilePath);
    this.db.exec('PRAGMA journal_mode = WAL;');
    this.db.exec('PRAGMA foreign_keys = ON;');
    this.db.exec('PRAGMA synchronous = NORMAL;');
    runMigrations(this.db);
  }

  public close(): void {
    try {
      this.db.close();
    } catch {
      // Already closed
    }
  }
}

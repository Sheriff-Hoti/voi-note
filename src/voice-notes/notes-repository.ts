import type { SqlExecutor, SqlRow } from './ports';

export type Note = {
  id: string;
  /** Epoch ms: the moment the Recording started. */
  createdAt: number;
  /** pending: the Recording is stopped but its Transcript isn't ready yet. */
  status: 'pending' | 'ready';
  /** The Transcript, replaced by the user's edits; '' while pending. */
  text: string;
  /** The Recording's audio, or null once there is none. */
  audioPath: string | null;
  durationMs: number;
};

/**
 * Schema migrations, in order. Migration i brings the database to version i + 1 (SQLite's user_version).
 * Never edit a released one: add the next.
 */
const MIGRATIONS: readonly (readonly string[])[] = [
  [
    `CREATE TABLE notes (
      id TEXT PRIMARY KEY NOT NULL,
      created_at INTEGER NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('pending', 'ready')),
      text TEXT NOT NULL,
      audio_path TEXT,
      duration_ms INTEGER NOT NULL
    )`,
    'CREATE INDEX notes_by_created_at ON notes (created_at)',
  ],
];

export interface NotesRepository {
  insert(note: Note): Promise<void>;
  get(id: string): Promise<Note | null>;
  /** Newest first. */
  list(): Promise<Note[]>;
  /** Replaces the Note's text. Resolves false when there is no Note with this id. */
  updateText(id: string, text: string): Promise<boolean>;
  remove(id: string): Promise<void>;
}

/** The Notes, stored in SQLite through `sql`. Brings the schema up to date before the first query. */
export function createNotesRepository(sql: SqlExecutor): NotesRepository {
  let migrated: Promise<void> | null = null;
  const ready = () => (migrated ??= migrate(sql));

  return {
    async insert(note) {
      await ready();
      await sql.execute(
        'INSERT INTO notes (id, created_at, status, text, audio_path, duration_ms) VALUES (?, ?, ?, ?, ?, ?)',
        [note.id, note.createdAt, note.status, note.text, note.audioPath, note.durationMs]
      );
    },
    async get(id) {
      await ready();
      const [row] = await sql.execute('SELECT * FROM notes WHERE id = ?', [id]);
      return row ? noteOf(row) : null;
    },
    async list() {
      await ready();
      return (await sql.execute('SELECT * FROM notes ORDER BY created_at DESC')).map(noteOf);
    },
    async updateText(id, text) {
      await ready();
      const updated = await sql.execute('UPDATE notes SET text = ? WHERE id = ? RETURNING id', [
        text,
        id,
      ]);
      return updated.length > 0;
    },
    async remove(id) {
      await ready();
      await sql.execute('DELETE FROM notes WHERE id = ?', [id]);
    },
  };
}

async function migrate(sql: SqlExecutor) {
  const [{ user_version }] = await sql.execute('PRAGMA user_version');
  for (let version = Number(user_version); version < MIGRATIONS.length; version++) {
    await sql.execute('BEGIN');
    try {
      for (const statement of MIGRATIONS[version]) await sql.execute(statement);
      // PRAGMA takes no bound parameters; version is a number we control.
      await sql.execute(`PRAGMA user_version = ${version + 1}`);
      await sql.execute('COMMIT');
    } catch (error) {
      await sql.execute('ROLLBACK');
      throw error;
    }
  }
}

function noteOf(row: SqlRow): Note {
  return {
    id: String(row.id),
    createdAt: Number(row.created_at),
    status: row.status === 'pending' ? 'pending' : 'ready',
    text: String(row.text),
    audioPath: row.audio_path === null ? null : String(row.audio_path),
    durationMs: Number(row.duration_ms),
  };
}

// A small read-only SQLite reader: enough to scan whole tables of a database
// file without loading it into memory (Little Navmap's databases are several
// hundred MB). It reads pages on demand through a ByteSource, which is a
// File in the browser and a Buffer in tests. No SQL: it walks the table
// b-trees directly, following https://www.sqlite.org/fileformat.html.
// UTF-8 databases only (the default, and what Little Navmap writes).

export interface ByteSource {
  size: number;
  read(offset: number, length: number): Promise<Uint8Array>;
}

export type SqlValue = number | string | Uint8Array | null;

export function fileSource(file: Blob): ByteSource {
  return { size: file.size, read: async (o, n) => new Uint8Array(await file.slice(o, o + n).arrayBuffer()) };
}

export function bufferSource(buf: Uint8Array): ByteSource {
  return { size: buf.length, read: async (o, n) => buf.subarray(o, o + n) };
}

/** Reads in large blocks and keeps a few, since a table's pages are mostly stored together. */
function blockCache(src: ByteSource, blockSize = 1 << 20, keep = 16): ByteSource {
  const blocks = new Map<number, Promise<Uint8Array>>();
  const block = (i: number) => {
    let b = blocks.get(i);
    if (!b) {
      b = src.read(i * blockSize, Math.min(blockSize, src.size - i * blockSize));
      blocks.set(i, b);
      if (blocks.size > keep) blocks.delete(blocks.keys().next().value!);
    }
    return b;
  };
  return {
    size: src.size,
    async read(o, n) {
      const first = Math.floor(o / blockSize);
      const last = Math.floor((o + n - 1) / blockSize);
      if (first === last) {
        const b = await block(first);
        return b.subarray(o - first * blockSize, o - first * blockSize + n);
      }
      const out = new Uint8Array(n);
      for (let i = first; i <= last; i++) {
        const b = await block(i);
        const start = Math.max(o, i * blockSize);
        const end = Math.min(o + n, (i + 1) * blockSize);
        out.set(b.subarray(start - i * blockSize, end - i * blockSize), start - o);
      }
      return out;
    },
  };
}

function varint(b: Uint8Array, p: number): [number, number] {
  let v = 0;
  for (let i = 0; i < 8; i++) {
    const c = b[p + i];
    v = v * 128 + (c & 0x7f);
    if (!(c & 0x80)) return [v, i + 1];
  }
  return [v * 256 + b[p + 8], 9];
}

const utf8 = new TextDecoder();

function decodeRecord(b: Uint8Array): SqlValue[] {
  const [headerSize, n0] = varint(b, 0);
  const types: number[] = [];
  for (let p = n0; p < headerSize; ) {
    const [t, n] = varint(b, p);
    types.push(t);
    p += n;
  }
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const out: SqlValue[] = [];
  let p = headerSize;
  for (const t of types) {
    if (t === 0) out.push(null);
    else if (t >= 1 && t <= 6) {
      const len = [0, 1, 2, 3, 4, 6, 8][t];
      let v = 0;
      for (let i = 0; i < len; i++) v = v * 256 + b[p + i];
      if (b[p] & 0x80) v -= 2 ** (8 * len); // two's complement
      out.push(v);
      p += len;
    } else if (t === 7) {
      out.push(dv.getFloat64(p));
      p += 8;
    } else if (t === 8 || t === 9) out.push(t - 8);
    else if (t >= 12) {
      const len = (t - (t % 2 ? 13 : 12)) / 2;
      const bytes = b.subarray(p, p + len);
      out.push(t % 2 ? utf8.decode(bytes) : bytes.slice());
      p += len;
    } else throw new Error(`Unsupported SQLite serial type ${t}`);
  }
  return out;
}

export interface TableInfo {
  name: string;
  rootPage: number;
  columns: string[];
  /** Column that is an alias for the rowid (INTEGER PRIMARY KEY), stored as NULL in records. */
  rowidColumn: number;
}

/** Column names from a CREATE TABLE statement. */
export function parseColumns(sql: string): { columns: string[]; rowidColumn: number } {
  const body = sql.slice(sql.indexOf('(') + 1, sql.lastIndexOf(')'));
  const parts: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of body.replace(/--[^\n]*/g, '')) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      parts.push(cur);
      cur = '';
    } else cur += ch;
  }
  parts.push(cur);
  const columns: string[] = [];
  let rowidColumn = -1;
  for (const part of parts.map((x) => x.trim()).filter(Boolean)) {
    if (/^(constraint|primary|foreign|unique|check)\b/i.test(part)) continue;
    const name = part.match(/^["`[]?([^\s"`\]]+)/)?.[1] ?? '';
    if (/^\w+\s+integer\s+primary\s+key/i.test(part)) rowidColumn = columns.length;
    columns.push(name.toLowerCase());
  }
  return { columns, rowidColumn };
}

export class SqliteFile {
  private constructor(
    private src: ByteSource,
    readonly pageSize: number,
    private usable: number,
  ) {}

  static async open(source: ByteSource): Promise<SqliteFile> {
    const h = await source.read(0, 100);
    if (utf8.decode(h.subarray(0, 15)) !== 'SQLite format 3') throw new Error('This is not an SQLite database file.');
    const raw = (h[16] << 8) | h[17];
    const pageSize = raw === 1 ? 65536 : raw;
    const enc = (h[56] << 24) | (h[57] << 16) | (h[58] << 8) | h[59];
    if (enc > 1) throw new Error('Only UTF-8 SQLite databases are supported.');
    return new SqliteFile(blockCache(source), pageSize, pageSize - h[20]);
  }

  private page(n: number) {
    return this.src.read((n - 1) * this.pageSize, this.pageSize);
  }

  /**
   * Every row of the table whose b-tree starts at rootPage. The tree is read
   * one level at a time with each level's pages in file order, so a big table
   * is read front to back instead of jumping around the file. Rows therefore
   * come out grouped by page, not strictly in rowid order.
   */
  async scan(rootPage: number, onRow: (rowid: number, values: SqlValue[]) => void): Promise<void> {
    const U = this.usable;
    const maxLocal = U - 35;
    const minLocal = Math.floor(((U - 12) * 32) / 255) - 23;
    const u32 = (b: Uint8Array, p: number) => ((b[p] << 24) >>> 0) + (b[p + 1] << 16) + (b[p + 2] << 8) + b[p + 3];
    let level = [rootPage];
    while (level.length) {
      const next: number[] = [];
      for (const n of level.sort((a, b) => a - b)) {
        const b = await this.page(n);
        const h = n === 1 ? 100 : 0;
        const type = b[h];
        const cells = (b[h + 3] << 8) | b[h + 4];
        if (type === 0x05) {
          for (let i = 0; i < cells; i++) next.push(u32(b, (b[h + 12 + 2 * i] << 8) | b[h + 13 + 2 * i]));
          next.push(u32(b, h + 8));
        } else if (type === 0x0d) {
          for (let i = 0; i < cells; i++) {
            let p = (b[h + 8 + 2 * i] << 8) | b[h + 9 + 2 * i];
            const [size, n1] = varint(b, p);
            p += n1;
            const [rowid, n2] = varint(b, p);
            p += n2;
            let payload: Uint8Array;
            if (size <= maxLocal) payload = b.subarray(p, p + size);
            else {
              const k = minLocal + ((size - minLocal) % (U - 4));
              const local = k <= maxLocal ? k : minLocal;
              payload = new Uint8Array(size);
              payload.set(b.subarray(p, p + local));
              let ovPage = u32(b, p + local);
              let off = local;
              while (ovPage && off < size) {
                const ov = await this.page(ovPage);
                const take = Math.min(U - 4, size - off);
                payload.set(ov.subarray(4, 4 + take), off);
                off += take;
                ovPage = u32(ov, 0);
              }
            }
            onRow(rowid, decodeRecord(payload));
          }
        } else throw new Error(`Unexpected SQLite page type ${type} on page ${n}.`);
      }
      level = next;
    }
  }

  async tables(): Promise<Map<string, TableInfo>> {
    const out = new Map<string, TableInfo>();
    await this.scan(1, (_rowid, v) => {
      if (v[0] !== 'table' || typeof v[1] !== 'string' || typeof v[3] !== 'number' || typeof v[4] !== 'string') return;
      out.set(v[1].toLowerCase(), { name: v[1], rootPage: v[3], ...parseColumns(v[4]) });
    });
    return out;
  }

  /** Rows of a table as objects with only the wanted columns. */
  async rows<K extends string>(table: TableInfo, wanted: readonly K[], onRow: (row: Record<K, SqlValue>) => void): Promise<void> {
    const idx = wanted.map((w) => {
      const i = table.columns.indexOf(w);
      if (i < 0) throw new Error(`Table ${table.name} has no column ${w}.`);
      return i;
    });
    await this.scan(table.rootPage, (rowid, v) => {
      const row = {} as Record<K, SqlValue>;
      wanted.forEach((w, j) => (row[w] = idx[j] === table.rowidColumn ? rowid : (v[idx[j]] ?? null)));
      onRow(row);
    });
  }
}

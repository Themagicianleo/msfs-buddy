"""Build the small test database src/simplanner/lib/fixtures/airways.sqlite.

Same tables and columns as Little Navmap's scenery database (atools schema),
filled with MADE-UP waypoints and airways near ZUDC/ZUNZ, plus a filler table
that forces multi-level b-trees and overflow pages. Run: python3 scripts/make-airway-fixture.py
"""
import math, os, sqlite3

OUT = os.path.join(os.path.dirname(__file__), '..', 'src', 'simplanner', 'lib', 'fixtures', 'airways.sqlite')
if os.path.exists(OUT):
    os.remove(OUT)
db = sqlite3.connect(OUT)
db.execute('pragma page_size = 1024')
db.executescript('''
create table metadata (db_version_major integer not null, db_version_minor integer not null, last_load_timestamp varchar(100),
  has_sid_star integer, airac_cycle varchar(10), valid_through varchar(10), data_source varchar(10), compiler_version varchar(1000), properties varchar(2000));
create table waypoint (
  waypoint_id integer primary key, file_id integer not null, nav_id integer, ident varchar(5) not null, name varchar(50),
  region varchar(2), airport_id integer, airport_ident varchar(4), artificial integer,
  type varchar(15), -- N = NDB, V = VOR, WN = named waypoint
  arinc_type varchar(4), num_victor_airway integer not null, num_jet_airway integer not null, mag_var double not null,
  lonx double not null, laty double not null,
foreign key(file_id) references bgl_file(bgl_file_id));
create table airway (
  airway_id integer primary key, airway_name varchar(5) not null, airway_type varchar(15) not null, route_type varchar(5),
  airway_fragment_no integer not null, sequence_no integer not null, from_waypoint_id integer not null, to_waypoint_id integer not null,
  direction varchar(1), minimum_altitude integer, maximum_altitude integer,
  left_lonx double not null, top_laty double not null, right_lonx double not null, bottom_laty double not null,
  from_lonx double not null, from_laty double not null, to_lonx double not null, to_laty double not null);
create table filler (filler_id integer primary key, note text, big integer, neg integer, f double);
''')
db.execute("insert into metadata values (1, 0, '2026-10-26T08:00:00', 1, '2610', '', 'MSFS24', 'test', '')")

# Made-up fixes: a chain along ~30N from ZUDC (100.05E) to ZUNZ (94.34E), a northern
# detour, and a one-way airway.
fixes = {
  'TSTAA': (100.4, 29.6, 'WN'), 'TSTAB': (99.2, 29.9, 'WN'), 'TSTAC': (98.0, 30.1, 'WN'),
  'TVR': (96.9, 30.0, 'V'), 'TSTAE': (95.8, 29.8, 'WN'), 'TSTAF': (94.9, 29.5, 'WN'),
  'TSTNA': (99.0, 31.2, 'WN'), 'TSTNB': (96.0, 31.4, 'WN'),
  'TSTOA': (100.0, 28.8, 'WN'), 'TSTOB': (95.0, 28.9, 'WN'),
}
ids = {}
for i, (ident, (lon, lat, typ)) in enumerate(fixes.items(), start=1):
    ids[ident] = i
    db.execute('insert into waypoint values (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', (i, 1, None, ident, None, 'ZU', None, None, None, typ, None, 0, 1, -1.5, lon, lat))

segs = []
def airway(name, chain, typ='J', direction='N'):
    for seq, (a, b) in enumerate(zip(chain, chain[1:]), start=1):
        segs.append((name, typ, 'O', 1, seq, ids[a], ids[b], direction, 15000, 49000, a, b))
airway('T1', ['TSTAA', 'TSTAB', 'TSTAC', 'TVR'])
airway('T2', ['TVR', 'TSTAE', 'TSTAF'])
airway('T9', ['TSTAA', 'TSTNA', 'TSTNB', 'TSTAF'])              # longer northern way round
airway('T5', ['TSTOB', 'TSTOA'], direction='F')                 # one-way, west to east only
for i, (name, typ, rt, frag, seq, f, t, d, mn, mx, a, b) in enumerate(segs, start=1):
    (lo1, la1, _), (lo2, la2, _) = fixes[a], fixes[b]
    db.execute('insert into airway values (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
               (i, name, typ, rt, frag, seq, f, t, d, mn, mx, min(lo1, lo2), max(la1, la2), max(lo1, lo2), min(la1, la2), lo1, la1, lo2, la2))

for i in range(1, 1501):
    note = ('long text %d ' % i) * (300 if i % 97 == 0 else 3)   # every 97th row overflows a 1 KB page
    db.execute('insert into filler values (?,?,?,?,?)', (i, note, i * 1_000_000_007, -i * 300, i / 7))
db.commit()
db.execute('vacuum')
db.close()
print(OUT, os.path.getsize(OUT), 'bytes')

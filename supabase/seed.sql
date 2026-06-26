-- =====================================================================
-- SAMPLE MASTER DATA  (Zones / Centers / Areas of South Gujarat)
-- Run this AFTER schema.sql, in the Supabase SQL Editor.
--
-- This is placeholder data so the app works on day one. When you send
-- the real master data, you only need to edit the three INSERT blocks
-- below (or clear these tables and re-import). Nothing else changes.
--
-- The latitude/longitude on each center & area power the "Near me"
-- feature later — leave them blank if you don't have them yet.
-- =====================================================================

-- ---------------- ZONES ----------------
insert into zones (name, description, sort_order) values
  ('Zone A', 'Surat City — North',  1),
  ('Zone B', 'Surat South & Navsari', 2),
  ('Zone C', 'Valsad & Vapi',       3),
  ('Zone D', 'Bardoli, Vyara & Bharuch', 4);

-- ---------------- CENTERS ----------------
-- city is what abhyasis can also filter by.
insert into centers (zone_id, name, city, address, latitude, longitude)
select z.id, c.name, c.city, c.address, c.lat, c.lng
from (values
  ('Zone A', 'Surat Central Center', 'Surat',   'Athwalines, Surat',        21.1862, 72.8113),
  ('Zone A', 'Varachha Center',      'Surat',   'Varachha Road, Surat',     21.2049, 72.8567),
  ('Zone B', 'Vesu Center',          'Surat',   'Vesu, Surat',              21.1389, 72.7706),
  ('Zone B', 'Navsari Center',       'Navsari', 'Station Road, Navsari',    20.9467, 72.9520),
  ('Zone C', 'Valsad Center',        'Valsad',  'Tithal Road, Valsad',      20.5992, 72.9342),
  ('Zone C', 'Vapi Center',          'Vapi',    'GIDC, Vapi',               20.3893, 72.9106),
  ('Zone D', 'Bardoli Center',       'Bardoli', 'Sardar Chowk, Bardoli',    21.1226, 73.1116),
  ('Zone D', 'Bharuch Center',       'Bharuch', 'Station Road, Bharuch',    21.7051, 72.9959)
) as c(zone_name, name, city, address, lat, lng)
join zones z on z.name = c.zone_name;

-- ---------------- AREAS ----------------
insert into areas (center_id, name, pincode, latitude, longitude)
select ct.id, a.name, a.pincode, a.lat, a.lng
from (values
  ('Surat Central Center', 'Adajan',      '395009', 21.1959, 72.7933),
  ('Surat Central Center', 'Athwa',       '395007', 21.1782, 72.8000),
  ('Surat Central Center', 'Nanpura',     '395001', 21.1862, 72.8200),
  ('Varachha Center',      'Varachha',    '395006', 21.2049, 72.8567),
  ('Varachha Center',      'Katargam',    '395004', 21.2295, 72.8330),
  ('Vesu Center',          'Vesu',        '395007', 21.1389, 72.7706),
  ('Vesu Center',          'Piplod',      '395007', 21.1500, 72.7800),
  ('Vesu Center',          'Pal',         '395009', 21.1700, 72.7600),
  ('Navsari Center',       'Navsari City','396445', 20.9467, 72.9520),
  ('Navsari Center',       'Bilimora',    '396321', 20.7686, 72.9608),
  ('Navsari Center',       'Gandevi',     '396360', 20.8030, 72.9970),
  ('Valsad Center',        'Valsad City', '396001', 20.5992, 72.9342),
  ('Valsad Center',        'Atul',        '396020', 20.5500, 72.9300),
  ('Valsad Center',        'Dharampur',   '396050', 20.5380, 73.1780),
  ('Vapi Center',          'Vapi GIDC',   '396195', 20.3893, 72.9106),
  ('Vapi Center',          'Chala',       '396191', 20.4000, 72.9200),
  ('Vapi Center',          'Daman Road',  '396191', 20.4100, 72.8900),
  ('Bardoli Center',       'Bardoli City','394601', 21.1226, 73.1116),
  ('Bardoli Center',       'Madhi',       '394340', 21.1500, 73.1500),
  ('Bardoli Center',       'Mota',        '394630', 21.1000, 73.0800),
  ('Bharuch Center',       'Bharuch City','392001', 21.7051, 72.9959),
  ('Bharuch Center',       'Ankleshwar',  '393001', 21.6266, 73.0020),
  ('Bharuch Center',       'Jhagadia',    '393110', 21.7300, 73.1500)
) as a(center_name, name, pincode, lat, lng)
join centers ct on ct.name = a.center_name;

-- Quick sanity check (optional): see what was loaded
-- select z.name as zone, c.name as center, c.city, count(a.id) as areas
-- from zones z join centers c on c.zone_id = z.id
-- left join areas a on a.center_id = c.id
-- group by z.name, c.name, c.city order by z.name, c.name;

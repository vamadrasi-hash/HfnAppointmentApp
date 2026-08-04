-- =====================================================================
-- MASTER DATA — Gujarat zones & centers
-- Run this AFTER schema.sql, in the Supabase SQL Editor.
--
-- Source: the Gujarat "Zone / Center / City" master sheet.
--   * 5 zones (4 real zones + one bucket for centers with no zone yet)
--   * 142 centers, each tagged with the city it sits in where known.
--
-- The app asks for exactly two things: a **Zone**, then a searchable
-- **City / Center** — so `city` here is what groups the centers together
-- in that second dropdown. Centers with a null city are still listed;
-- they appear under "Other centers".
--
-- Districts and talukas from the source sheet are deliberately NOT
-- imported — the app does not use them.
--
-- Re-running this file: clear the tables first (this also detaches any
-- profiles / slots that pointed at the old rows):
--     delete from centers;
--     delete from zones;
-- =====================================================================

-- ---------------- ZONES ----------------
insert into zones (name, description, sort_order) values
  ('Zone 6A - Gujarat North', 'North Gujarat — Ahmedabad, Gandhinagar, Mehsana, Sabarkantha, Banaskantha', 1),
  ('Zone 6B - Gujarat South', 'South Gujarat — Surat, Navsari, Valsad, Vapi, Daman, Silvassa', 2),
  ('Zone 6C - Gujarat South West', 'Saurashtra & Kutch — Rajkot, Jamnagar, Bhavnagar, Junagadh, Bhuj', 3),
  ('Zone 6D - Mid Gujarat', 'Mid Gujarat — Vadodara, Anand, Bharuch, Godhra, Dahod', 4),
  ('Zone 6 - Gujarat (unassigned)', 'Centers from the master list that do not yet carry a zone', 9);

-- ---------------- CENTERS ----------------
-- One row per center. `city` groups centers together in the app's
-- "City / Center" picker; it is null for centers whose city is not yet known
-- (those are still listed, under "Other centers").
insert into centers (zone_id, name, city)
select z.id, c.name, c.city
from (values
  -- Zone 6A - Gujarat North
  ('Zone 6A - Gujarat North'      , 'AHMEDABAD'                     , 'Ahmedabad'),
  ('Zone 6A - Gujarat North'      , 'SHAHIBAUG'                     , 'Ahmedabad'),
  ('Zone 6A - Gujarat North'      , 'BOPAL'                         , 'Ambali'),
  ('Zone 6A - Gujarat North'      , 'CHANDKHEDA'                    , 'Chandkheda Society Area'),
  ('Zone 6A - Gujarat North'      , 'Gota'                          , 'Chenpur'),
  ('Zone 6A - Gujarat North'      , 'DHOLKA'                        , 'Dholka'),
  ('Zone 6A - Gujarat North'      , 'GANDHINAGAR'                   , 'Gandhinagar'),
  ('Zone 6A - Gujarat North'      , 'GANDHINAGAR-1'                 , 'Gandhinagar'),
  ('Zone 6A - Gujarat North'      , 'GANDHINAGAR-2'                 , 'Gandhinagar'),
  ('Zone 6A - Gujarat North'      , 'GANDHINAGAR-3'                 , 'Gandhinagar'),
  ('Zone 6A - Gujarat North'      , 'SARKHEJ'                       , 'Gandhinagar'),
  ('Zone 6A - Gujarat North'      , 'HIMMATNAGAR'                   , 'Idar'),
  ('Zone 6A - Gujarat North'      , 'KADI'                          , 'Kadi'),
  ('Zone 6A - Gujarat North'      , 'KALOL'                         , 'Kalol'),
  ('Zone 6A - Gujarat North'      , 'MANINAGAR'                     , 'Khokhara Mehmadabad'),
  ('Zone 6A - Gujarat North'      , 'Banas Kantha'                  , 'Kotarwada'),
  ('Zone 6A - Gujarat North'      , 'MEHSANA'                       , 'Mehsana'),
  ('Zone 6A - Gujarat North'      , 'MOTERA'                        , 'Motera'),
  ('Zone 6A - Gujarat North'      , 'Ambawadi'                      , 'Navrangpura'),
  ('Zone 6A - Gujarat North'      , 'USMANPURA'                     , 'Navrangpura'),
  ('Zone 6A - Gujarat North'      , 'Paldi-Ahmedabad'               , 'Paldi Ahmedabad'),
  ('Zone 6A - Gujarat North'      , 'PRAHLADNAGAR'                  , 'Prahlad Nagar'),
  ('Zone 6A - Gujarat North'      , 'TALOD'                         , 'Prantij'),
  ('Zone 6A - Gujarat North'      , 'Anjar'                         , 'Ratnal'),
  ('Zone 6A - Gujarat North'      , 'SCIENCE CITY'                  , 'Sola'),
  ('Zone 6A - Gujarat North'      , 'BAPUNAGAR'                     , 'T B Nagar'),
  ('Zone 6A - Gujarat North'      , 'UNJHA'                         , 'Unjha'),
  ('Zone 6A - Gujarat North'      , 'HIMATNAGAR'                    , 'Vadali'),
  ('Zone 6A - Gujarat North'      , 'VASTRAPUR'                     , 'Vastrapur'),
  ('Zone 6A - Gujarat North'      , 'Ahmedabad-Ambawadi'            , null),
  ('Zone 6A - Gujarat North'      , 'Ahmedabad-Bapu Nagar'          , null),
  ('Zone 6A - Gujarat North'      , 'Ahmedabad-Bopal'               , null),
  ('Zone 6A - Gujarat North'      , 'Ahmedabad-Chandkheda'          , null),
  ('Zone 6A - Gujarat North'      , 'Ahmedabad-Gota'                , null),
  ('Zone 6A - Gujarat North'      , 'Ahmedabad-Maninagar'           , null),
  ('Zone 6A - Gujarat North'      , 'Ahmedabad-Motera'              , null),
  ('Zone 6A - Gujarat North'      , 'Ahmedabad-Paldi'               , null),
  ('Zone 6A - Gujarat North'      , 'Ahmedabad-Prahladnagar'        , null),
  ('Zone 6A - Gujarat North'      , 'Ahmedabad-Sarkhej'             , null),
  ('Zone 6A - Gujarat North'      , 'Ahmedabad-Science City'        , null),
  ('Zone 6A - Gujarat North'      , 'Ahmedabad-Shahibaug'           , null),
  ('Zone 6A - Gujarat North'      , 'Ahmedabad-Usmanpura'           , null),
  ('Zone 6A - Gujarat North'      , 'Ahmedabad-Vastrapur'           , null),
  ('Zone 6A - Gujarat North'      , 'Gandhinagar-1 (Kudasan)'       , null),
  ('Zone 6A - Gujarat North'      , 'Gandhinagar-2 (Sargasan)'      , null),
  ('Zone 6A - Gujarat North'      , 'Gandhinagar-3 (IFFCO Township)', null),
  ('Zone 6A - Gujarat North'      , 'Vadali'                        , null),

  -- Zone 6B - Gujarat South
  ('Zone 6B - Gujarat South'      , 'Akoti'                         , 'Akoti'),
  ('Zone 6B - Gujarat South'      , 'Bharthana/Althan'              , 'Althan'),
  ('Zone 6B - Gujarat South'      , 'Athwalines/Citylight'          , 'Athwalines'),
  ('Zone 6B - Gujarat South'      , 'Bardoli'                       , 'Bardoli'),
  ('Zone 6B - Gujarat South'      , 'DAMAN'                         , 'Daman'),
  ('Zone 6B - Gujarat South'      , 'NAVSARI'                       , 'Navsari'),
  ('Zone 6B - Gujarat South'      , 'SILVASSA'                      , 'Silvassa'),
  ('Zone 6B - Gujarat South'      , 'Surat-Central-Salabatpura'     , 'Surat'),
  ('Zone 6B - Gujarat South'      , 'Surat-East-Varacha'            , 'Surat'),
  ('Zone 6B - Gujarat South'      , 'Surat-South West-Althan'       , 'Surat'),
  ('Zone 6B - Gujarat South'      , 'Surat-South West-Dumas'        , 'Surat'),
  ('Zone 6B - Gujarat South'      , 'Surat-South West-Vesu'         , 'Surat'),
  ('Zone 6B - Gujarat South'      , 'Surat-South-Udhna'             , 'Surat'),
  ('Zone 6B - Gujarat South'      , 'Surat-West-Adajan'             , 'Surat'),
  ('Zone 6B - Gujarat South'      , 'Surat-West-Jahangirpura'       , 'Surat'),
  ('Zone 6B - Gujarat South'      , 'Umbergaon'                     , 'Umbergaon'),
  ('Zone 6B - Gujarat South'      , 'Chembur'                       , 'Valsad'),
  ('Zone 6B - Gujarat South'      , 'Khhergam'                      , 'Valsad'),
  ('Zone 6B - Gujarat South'      , 'Pardi'                         , 'Valsad'),
  ('Zone 6B - Gujarat South'      , 'VALSAD'                        , 'Valsad'),
  ('Zone 6B - Gujarat South'      , 'VAPI'                          , 'Vapi'),

  -- Zone 6C - Gujarat South West
  ('Zone 6C - Gujarat South West' , 'Kutch'                         , 'Adipur'),
  ('Zone 6C - Gujarat South West' , 'Jamnagar East'                 , 'Aerodromme'),
  ('Zone 6C - Gujarat South West' , 'AMRELI'                        , 'Amreli (Og)'),
  ('Zone 6C - Gujarat South West' , 'Asiyavadar'                    , 'Asiyavadar'),
  ('Zone 6C - Gujarat South West' , 'Limbdi'                        , 'Bankodi'),
  ('Zone 6C - Gujarat South West' , 'Dhrangadhra'                   , 'Bavali'),
  ('Zone 6C - Gujarat South West' , 'BHAVNAGAR'                     , 'Bhavnagar'),
  ('Zone 6C - Gujarat South West' , 'Devbhoomi Dwarka'              , 'Chudeshvar'),
  ('Zone 6C - Gujarat South West' , 'Datrana'                       , 'Datrana'),
  ('Zone 6C - Gujarat South West' , 'Palitana'                      , 'Gariyadhar'),
  ('Zone 6C - Gujarat South West' , 'Balsar'                        , 'Gondal'),
  ('Zone 6C - Gujarat South West' , 'JAMNAGAR'                      , 'Jamnagar'),
  ('Zone 6C - Gujarat South West' , 'Jamnagar North'                , 'Jamnagar'),
  ('Zone 6C - Gujarat South West' , 'JUNAGADH'                      , 'Junagadh'),
  ('Zone 6C - Gujarat South West' , 'Bhuj'                          , 'Kanderai'),
  ('Zone 6C - Gujarat South West' , 'Sutrapada'                     , 'Kodinar'),
  ('Zone 6C - Gujarat South West' , 'MAHUVA'                        , 'Mahuva'),
  ('Zone 6C - Gujarat South West' , 'MANGROL'                       , 'Mangrol'),
  ('Zone 6C - Gujarat South West' , 'Meghpur Titodi'                , 'Meghpur Titodi'),
  ('Zone 6C - Gujarat South West' , 'Mundra'                        , 'Mundra'),
  ('Zone 6C - Gujarat South West' , 'Nandana'                       , 'Nandana'),
  ('Zone 6C - Gujarat South West' , 'PORBANDAR'                     , 'Porbandar'),
  ('Zone 6C - Gujarat South West' , 'RAJKOT'                        , 'Rajkot'),
  ('Zone 6C - Gujarat South West' , 'Patan'                         , 'Sami'),
  ('Zone 6C - Gujarat South West' , 'Jamkhambhaliya'                , 'Sanakhala'),
  ('Zone 6C - Gujarat South West' , 'Sihor'                         , 'Sihor'),
  ('Zone 6C - Gujarat South West' , 'Sikka'                         , 'Sikka'),
  ('Zone 6C - Gujarat South West' , 'Sabarkantha'                   , 'Sonasan'),
  ('Zone 6C - Gujarat South West' , 'SURENDRANAGAR'                 , 'Surendranagar'),
  ('Zone 6C - Gujarat South West' , 'Jamnagar Central'              , 'Swastik Society'),
  ('Zone 6C - Gujarat South West' , 'TITODI'                        , 'Titodi'),
  ('Zone 6C - Gujarat South West' , 'Sonipat'                       , 'Vadodra'),
  ('Zone 6C - Gujarat South West' , 'Veraval'                       , 'Veraval'),
  ('Zone 6C - Gujarat South West' , 'Dartana'                       , null),
  ('Zone 6C - Gujarat South West' , 'Gandhidham'                    , null),
  ('Zone 6C - Gujarat South West' , 'Khambhalia'                    , null),
  ('Zone 6C - Gujarat South West' , 'Limbadi'                       , null),

  -- Zone 6D - Mid Gujarat
  ('Zone 6D - Mid Gujarat'        , 'Kheda'                         , 'Bhadrasa'),
  ('Zone 6D - Mid Gujarat'        , 'Ankleshwar'                    , 'Bharuch'),
  ('Zone 6D - Mid Gujarat'        , 'JHANOR'                        , 'Bharuch'),
  ('Zone 6D - Mid Gujarat'        , 'Bharuch'                       , 'Bharuch Ina'),
  ('Zone 6D - Mid Gujarat'        , 'Selamba'                       , 'Chikali'),
  ('Zone 6D - Mid Gujarat'        , 'Vadodara'                      , 'Chokari'),
  ('Zone 6D - Mid Gujarat'        , 'Dahod'                         , 'Dahod'),
  ('Zone 6D - Mid Gujarat'        , 'Vadodara - North East'         , 'Fateganj'),
  ('Zone 6D - Mid Gujarat'        , 'Morbi'                         , 'Ghanshyampur'),
  ('Zone 6D - Mid Gujarat'        , 'GODHRA'                        , 'Godhra'),
  ('Zone 6D - Mid Gujarat'        , 'Anand'                         , 'Hasanpura'),
  ('Zone 6D - Mid Gujarat'        , 'LUNAWADA'                      , 'Lunawada'),
  ('Zone 6D - Mid Gujarat'        , 'Vadodara - South'              , 'Mi Estate'),
  ('Zone 6D - Mid Gujarat'        , 'Nadiad'                        , 'Pipalvada'),
  ('Zone 6D - Mid Gujarat'        , 'Mahisagar'                     , 'Raliyata (Balasinor)'),
  ('Zone 6D - Mid Gujarat'        , 'Panch Mahals'                  , 'Sansoli'),
  ('Zone 6D - Mid Gujarat'        , 'Gir Somnath'                   , 'Sokhda'),
  ('Zone 6D - Mid Gujarat'        , 'Palanpur'                      , 'Vadgam'),
  ('Zone 6D - Mid Gujarat'        , 'Vadodara - North West'         , 'Vadodara'),
  ('Zone 6D - Mid Gujarat'        , 'Vadodara - South West'         , 'Vadodara (Baroda)'),
  ('Zone 6D - Mid Gujarat'        , 'Chhotaudepur'                  , 'Virpur'),
  ('Zone 6D - Mid Gujarat'        , 'Vadodara - East'               , 'Waghodia Road'),
  ('Zone 6D - Mid Gujarat'        , 'Vadodara-East'                 , null),
  ('Zone 6D - Mid Gujarat'        , 'Vadodara-North East'           , null),
  ('Zone 6D - Mid Gujarat'        , 'Vadodara-North West'           , null),
  ('Zone 6D - Mid Gujarat'        , 'Vadodara-South'                , null),
  ('Zone 6D - Mid Gujarat'        , 'Vadodara-South West'           , null),

  -- Zone 6 - Gujarat (unassigned)
  ('Zone 6 - Gujarat (unassigned)', 'Narmada'                       , 'Bharuch'),
  ('Zone 6 - Gujarat (unassigned)', 'Botad'                         , 'Botad(City)'),
  ('Zone 6 - Gujarat (unassigned)', 'Dangs'                         , 'Chikhalda'),
  ('Zone 6 - Gujarat (unassigned)', 'Bareilly'                      , 'Gandhinagar'),
  ('Zone 6 - Gujarat (unassigned)', 'Aravalli'                      , 'Jalampur'),
  ('Zone 6 - Gujarat (unassigned)', 'KALOL (Taluka)'                , 'Kalol'),
  ('Zone 6 - Gujarat (unassigned)', 'Tapi'                          , 'Katiskuva Najik'),
  ('Zone 6 - Gujarat (unassigned)', 'Jamnagar West'                 , 'Medical Campus'),
  ('Zone 6 - Gujarat (unassigned)', 'Kulithalai'                    , 'Mehsana'),
  ('Zone 6 - Gujarat (unassigned)', 'Udhana'                        , null)
) as c(zone_name, name, city)
join zones z on z.name = c.zone_name;

-- Quick sanity check (optional): see what was loaded
-- select z.name as zone, count(*) as centers, count(distinct c.city) as cities
-- from zones z left join centers c on c.zone_id = z.id
-- group by z.name, z.sort_order order by z.sort_order;

-- ---------------- HEARTSPOTS ----------------
-- Every center starts with one heartspot named after it, so a preceptor
-- always has something to pick when they say where a sitting happens.
-- Admins rename these and add the rest (Master data -> a center -> Heartspots).
insert into heartspots (center_id, name)
select c.id, c.name from centers c
on conflict do nothing;

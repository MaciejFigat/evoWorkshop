/* Stage definitions. Panels in stages_strips.webp: sunset old town [0,251], Vistula night [252,222],
   downtown day [475,192]. Stage 1 is playable; the others are registered as placeholders so the
   stage-select / progression code is already data driven (art for 2-6 is still missing, see
   docs). `waves`: when the camera reaches `at` (world px) it locks, the listed enemies walk in
   from the screen edges (delay in ticks), and the lock lifts when they are all down. */
window.STAGES = [
  {
    id: 1, name: 'DOWNTOWN WARSAW', sub: 'VISTULA BOULEVARD',
    bg: 'assets/stages/stages_strips.webp', panel: [252, 222],   // panel = [top y, height] cut from the strips image
    bgH: 232,                                               // drawn picture height; paving is generated below it
    floorTop: 236, floorBottom: 268, startX: 70,
    waves: [
      { at: 150,  enemies: [{ type: 'goon', side: 1, delay: 0 }, { type: 'goon', side: -1, delay: 70 }] },
      { at: 700,  enemies: [{ type: 'goon', side: 1, delay: 0 }, { type: 'goon', side: -1, delay: 40 }, { type: 'goon', side: 1, delay: 160 }] },
      { at: 1250, enemies: [{ type: 'goon', side: -1, delay: 0 }, { type: 'goon', side: 1, delay: 0 }, { type: 'goon', side: -1, delay: 120 }, { type: 'goon', side: 1, delay: 200 }] },
    ],
  },
  { id: 2, name: 'SUBWAY STATION',      placeholder: true },
  { id: 3, name: 'WAREHOUSE DISTRICT',  placeholder: true },
  { id: 4, name: 'PARKING GARAGE',      placeholder: true },
  { id: 5, name: 'MAFIA HEADQUARTERS',  placeholder: true },
  { id: 6, name: 'FINAL BOSS ARENA',    placeholder: true },
];

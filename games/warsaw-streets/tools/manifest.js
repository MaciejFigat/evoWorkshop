/* Hand-measured frame rectangles for every concept sheet: [x0, y0, x1, y1] in sheet pixels
   (1536x1024 originals in assets/reference/). Rectangles stop above the baked-in pose labels.
   Where two poses touch (Nina COMBO, Nina idle 1|2) the split column is the sparsest column
   between them. `scale` brings every character to roughly 90 px standing height for the
   480x270 internal canvas.

   A frame is either a rectangle, or { rect, excl: [rects] } to blank out pixels that belong to
   a neighbouring sprite (sheet coordinates). */
window.EXTRACT_MANIFEST = {
  nina: {
    file: 'nina_sheet.webp',
    bg: [39, 41, 75],            // flat purple-navy
    tol: 24,
    scale: 0.51,
    frames: {
      idle0:    [1215, 162, 1327, 352],
      idle1:    [1327, 162, 1426, 352],
      idle2:    [1426, 162, 1520, 352],
      walk0:    [8, 395, 142, 606],
      walk1:    [146, 395, 258, 606],
      punch:    [262, 395, 446, 606],
      combo0:   [450, 395, 600, 606],
      combo1:   [600, 395, 762, 606],
      kick:     [772, 395, 970, 606],
      highkick: [975, 395, 1155, 606],
      special:  [1240, 395, 1500, 606],
      hurt:     [25, 650, 190, 854],
      block:    [225, 650, 392, 854],
      crouch:   [435, 650, 575, 854],
      jump:     [660, 650, 795, 854],
      grab:     [800, 650, 1010, 854],
      throw:    [1025, 650, 1230, 854],
      knife:    [1285, 650, 1480, 854],
    },
    // The sheet has no knockdown / dead art: derive it (hurt tipped back = falling, block laid
    // flat = lying down). Placeholder until proper fall / lie-down frames are drawn.
    derived: {
      fall0: ['hurt', 30],
      down:  ['block', 90],
    },
    // Foot-centroid pivots are wrong for airborne / lying poses: centre them on the body.
    pivots: { jump: [29, 78], fall0: 'mid', down: 'mid' },
  },
  goon: {
    file: 'enemies_sheet.webp',
    tol: 24,
    scale: 0.88,
    minSpeck: 60,
    frames: {
      idle:  [186, 134, 241, 247],
      guard: [241, 134, 301, 247],
      walk:  [301, 134, 369, 247],
      stalk: [370, 134, 430, 247],
      grab:  [432, 134, 498, 247],
      punch: [500, 134, 568, 247],
      kick:  { rect: [568, 134, 664, 247], excl: [[636, 196, 664, 247]] },   // exclude the knockdown boots
      down:  [636, 190, 752, 247],
    },
    pivots: { down: 'mid' },
  },
};

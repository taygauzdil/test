// Body plan of the six-armed arena monster. Every system (grid, loadout, physics, animation,
// rendering, AI) iterates over ARMS, so the arm layout is defined in exactly one place.
//
// Arms come in three tiers per side: 1 = top (raised), 2 = middle, 3 = bottom (lowered).
// "L" arms are on the screen-left side of the preparation view.

export const ARMS = ['armL1', 'armL2', 'armL3', 'armR1', 'armR2', 'armR3'];

export const ARM_INFO = {};
for (const key of ARMS) {
  const side = key[3] === 'L' ? -1 : 1;
  const tier = +key[4] - 1;
  ARM_INFO[key] = {
    key, side, tier,
    mirror: `arm${side < 0 ? 'R' : 'L'}${tier + 1}`,
    label: `${side < 0 ? 'Left' : 'Right'} ${['Top', 'Middle', 'Bottom'][tier]} Arm`,
    short: `${side < 0 ? 'L' : 'R'}${tier + 1}`,
  };
}

export const REGIONS = ['head', 'body', ...ARMS, 'legL', 'legR'];
export const REGION_LABEL = { head: 'Head', body: 'Body', legL: 'Left Leg', legR: 'Right Leg' };
export const REGION_SHORT = { head: 'HEAD', body: 'BODY', legL: 'L LEG', legR: 'R LEG' };
for (const a of ARMS) { REGION_LABEL[a] = ARM_INFO[a].label; REGION_SHORT[a] = ARM_INFO[a].short + ' ARM'; }

export const isArm = r => r.startsWith('arm');

// Per-tier geometry (local space, character facing +z, before mirroring by side):
//  shoulder: offset from the chest joint
//  aHand:    hand position in the preparation A-pose
//  dy/dx:    offset applied to combat hand targets so the three tiers do not overlap
export const TIER = [
  { shoulder: [0.34, 0.0, 0.0], aHand: [0.8, 1.86, 0.05], dy: 0.2, dx: 0.0, dz: -0.04 },
  { shoulder: [0.41, -0.2, 0.02], aHand: [0.93, 1.25, 0.08], dy: 0.0, dx: 0.08, dz: 0.04 },
  { shoulder: [0.35, -0.4, 0.04], aHand: [0.8, 0.66, 0.08], dy: -0.22, dx: 0.04, dz: 0.08 },
];

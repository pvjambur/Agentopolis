export type CharacterType =
  | 'char_A_green_top'
  | 'char_B_orange_top'
  | 'char_C_grey_hair'
  | 'char_D_hardhat'
  | 'char_E_purple_top'
  | 'char_F_darkhair_orange'

export type Direction = 'left' | 'front' | 'back' | 'right'
export type Frame = 'idle' | 'walk_a' | 'walk_b'

export type SpriteMap = Record<CharacterType, Record<Direction, Record<Frame, string>>>

export const spriteMap: SpriteMap = {
  char_A_green_top: {
    left:  { idle: 'tile_0023', walk_a: 'tile_0050', walk_b: 'tile_0077' },
    front: { idle: 'tile_0024', walk_a: 'tile_0051', walk_b: 'tile_0078' },
    back:  { idle: 'tile_0025', walk_a: 'tile_0052', walk_b: 'tile_0079' },
    right: { idle: 'tile_0026', walk_a: 'tile_0053', walk_b: 'tile_0080' },
  },
  char_B_orange_top: {
    left:  { idle: 'tile_0104', walk_a: 'tile_0131', walk_b: 'tile_0158' },
    front: { idle: 'tile_0105', walk_a: 'tile_0132', walk_b: 'tile_0159' },
    back:  { idle: 'tile_0106', walk_a: 'tile_0133', walk_b: 'tile_0160' },
    right: { idle: 'tile_0107', walk_a: 'tile_0134', walk_b: 'tile_0161' },
  },
  char_C_grey_hair: {
    left:  { idle: 'tile_0185', walk_a: 'tile_0212', walk_b: 'tile_0239' },
    front: { idle: 'tile_0186', walk_a: 'tile_0213', walk_b: 'tile_0240' },
    back:  { idle: 'tile_0187', walk_a: 'tile_0214', walk_b: 'tile_0241' },
    right: { idle: 'tile_0188', walk_a: 'tile_0215', walk_b: 'tile_0242' },
  },
  char_D_hardhat: {
    left:  { idle: 'tile_0266', walk_a: 'tile_0292', walk_b: 'tile_0320' },
    front: { idle: 'tile_0267', walk_a: 'tile_0293', walk_b: 'tile_0321' },
    back:  { idle: 'tile_0268', walk_a: 'tile_0294', walk_b: 'tile_0322' },
    right: { idle: 'tile_0269', walk_a: 'tile_0295', walk_b: 'tile_0323' },
  },
  char_E_purple_top: {
    left:  { idle: 'tile_0347', walk_a: 'tile_0374', walk_b: 'tile_0401' },
    front: { idle: 'tile_0348', walk_a: 'tile_0375', walk_b: 'tile_0402' },
    back:  { idle: 'tile_0349', walk_a: 'tile_0376', walk_b: 'tile_0403' },
    right: { idle: 'tile_0350', walk_a: 'tile_0377', walk_b: 'tile_0404' },
  },
  char_F_darkhair_orange: {
    left:  { idle: 'tile_0428', walk_a: 'tile_0455', walk_b: 'tile_0482' },
    front: { idle: 'tile_0429', walk_a: 'tile_0456', walk_b: 'tile_0483' },
    back:  { idle: 'tile_0430', walk_a: 'tile_0457', walk_b: 'tile_0484' },
    right: { idle: 'tile_0431', walk_a: 'tile_0458', walk_b: 'tile_0485' },
  },
}

export function tileUrl(tileId: string): string {
  return `/assets/tilesets/kenney-rpg-urban/${tileId}.png`
}

export function frontIdleUrl(characterType: CharacterType): string {
  return tileUrl(spriteMap[characterType].front.idle)
}

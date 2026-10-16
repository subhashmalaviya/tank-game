export type TankId =
  | 'titan'
  | 'phantom'
  | 'volt'
  | 'inferno'
  | 'frostbite'
  | 'viper'
  | 'bastion'
  | 'quake'
  | 'medic'
  | 'nova';
export type Status =
  | 'fortify'
  | 'cloak'
  | 'emp'
  | 'burn'
  | 'freeze'
  | 'shield'
  | 'overcharge'
  | 'phase'
  | 'hunter'
  | 'shieldTurns';
export interface Weapon {
  id: string;
  name: string;
  damage: number;
  speed: number;
  gravity: number;
  radius: number;
  direct: number;
  terrain: number;
  status?: Status;
  projectiles: number;
  cooldown: number;
  ammo: number;
  behavior?: 'bounce' | 'guided' | 'pierce' | 'chain';
  color: string;
  chargeMs?: number;
  launchGapMs?: number;
  effect?: string;
}
export interface TankDefinition {
  id: TankId;
  name: string;
  role: string;
  description: string;
  weakness: string;
  category: string;
  hp: number;
  armor: number;
  mobility: number;
  damage: number;
  weapon: string;
  color: string;
  ability: { name: string; description: string; cooldown: number; cost: number };
}
export interface MapTheme {
  id: string;
  name: string;
  tag: string;
  sky: string;
  horizon: string;
  earth: string;
  surface: string;
  accent: string;
  gravity: number;
  roughness: number;
  hazard?: 'lava' | 'toxic' | 'energy';
  slippery?: boolean;
  islands?: boolean;
}
export interface MatchConfig {
  combatFlow?: 'simultaneous' | 'turns';
  mode: 'ffa' | 'teams';
  maxPlayers: number;
  teams: number;
  teamSize: number;
  map: string;
  tankRule: 'open' | 'unique' | 'random';
  turnSeconds: number;
  healthMultiplier: number;
  damageMultiplier: number;
  friendlyFire: boolean;
  durationMinutes: number;
  winCondition: 'survival' | 'damage';
  skipDisconnected: boolean;
  bots: number;
  visibility: 'private' | 'public';
}
export interface LobbyPlayer {
  id: string;
  name: string;
  tank: TankId;
  team: number;
  ready: boolean;
  connected: boolean;
  bot: boolean;
}
export interface Fighter extends LobbyPlayer {
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  armor: number;
  energy: number;
  cooldown: number;
  statuses: Partial<Record<Status, number>>;
  moved: number;
  superpowerUsed?: boolean;
  weapons: Record<string, { ammo: number; cooldown: number }>;
  stats: { damage: number; shots: number; hits: number; kills: number };
  angle: number;
  power: number;
}
export interface Hazard {
  x: number;
  y: number;
  radius: number;
  kind: 'lava' | 'toxic' | 'energy' | 'fire';
  turns: number;
  owner?: string;
}
export interface Point {
  x: number;
  y: number;
}
export interface Shot {
  weapon: string;
  owner: string;
  path: Point[];
  impact: Point;
  radius: number;
  color: string;
  id?: string;
  round?: number;
  launchMs?: number;
  impactMs?: number;
  hit?: boolean;
  reflections?: { x: number; y: number; defender: string }[];
  terrainRadius?: number;
  damage: { id: string; amount: number; absorbed?: number; x: number; y: number }[];
}
export interface MatchResult {
  winnerIds: string[];
  draw: boolean;
  reason: string;
  duration: number;
  rankings: {
    id: string;
    name: string;
    team: number;
    hp: number;
    damage: number;
    shots: number;
    hits: number;
    kills: number;
  }[];
}
export interface MatchState {
  id: string;
  phase?: 'planning' | 'resolving';
  readyIds?: string[];
  ownPlan?: Plan;
  resolutionStartedAt?: number;
  resolutionStart?: { id: string; hp: number; shield: number }[];
  environment?: Environment;
  abilityEvents?: AbilityEvent[];
  superEvents?: SuperEvent[];
  seed: number;
  map: string;
  fighters: Fighter[];
  terrain: number[];
  hazards: Hazard[];
  turn: number;
  activeId: string;
  deadline: number;
  startedAt: number;
  resolveAt: number;
  revision: number;
  shots: Shot[];
  message: string;
  result: MatchResult | null;
  config: MatchConfig;
}
export interface RoomState {
  serverTime: number;
  code: string;
  hostId: string;
  phase: 'lobby' | 'battle' | 'results';
  players: LobbyPlayer[];
  config: MatchConfig;
  match: MatchState | null;
  passwordProtected: boolean;
}
export interface Plan {
  round: number;
  angle: number;
  power: number;
  weapon: string;
  ability: boolean;
  targetId?: string;
  superpower?: boolean;
  superTargetX?: number;
  pass?: boolean;
}
export interface AbilityEvent {
  owner: string;
  tank: TankId;
  x: number;
  y: number;
  targetId?: string;
  label: string;
}
export interface Cover {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  hp: number;
  maxHp: number;
  material: 'stone' | 'ice' | 'metal' | 'wood' | 'barrel' | 'barrier';
  active: boolean;
}
export interface Environment {
  wind: number;
  gravityZones: { from: number; to: number; multiplier: number }[];
  cover: Cover[];
  rules: string;
}
export type Command =
  | ({ type: 'lock' } & Plan)
  | { type: 'move'; direction: -1 | 1; distance: number }
  | { type: 'fire'; angle: number; power: number; weapon: string }
  | { type: 'ability'; targetId?: string }
  | { type: 'pass' };
export interface Reply {
  ok: boolean;
  error?: string;
  room?: RoomState;
  playerId?: string;
  token?: string;
}

export interface SuperEvent {
  cancelled?: boolean;
  owner: string;
  tank: TankId;
  from: Point;
  to: Point;
  path: Point[];
  targets: (Point & { id?: string })[];
  facing?: number;
  durationMs: number;
}

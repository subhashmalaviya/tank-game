import { z } from 'zod';
import { MAPS } from './maps';
import type { MatchConfig } from '../types';
export const DEFAULT_CONFIG: MatchConfig = {
  combatFlow: 'simultaneous',
  mode: 'ffa',
  maxPlayers: 4,
  teams: 2,
  teamSize: 2,
  map: 'random',
  tankRule: 'open',
  turnSeconds: 30,
  healthMultiplier: 1,
  damageMultiplier: 1,
  friendlyFire: false,
  durationMinutes: 15,
  winCondition: 'survival',
  skipDisconnected: true,
  bots: 0,
  visibility: 'private',
};
export const configSchema = z
  .object({
    combatFlow: z.enum(['simultaneous', 'turns']).default('simultaneous'),
    mode: z.enum(['ffa', 'teams']),
    maxPlayers: z.number().int().min(2).max(8),
    teams: z.number().int().min(2).max(4),
    teamSize: z.number().int().min(1).max(4),
    map: z.string().refine((x) => x === 'random' || MAPS.some((m) => m.id === x)),
    tankRule: z.enum(['open', 'unique', 'random']),
    turnSeconds: z.number().int().min(10).max(120),
    healthMultiplier: z.number().min(0.5).max(3),
    damageMultiplier: z.number().min(0.5).max(3),
    friendlyFire: z.boolean(),
    durationMinutes: z.number().int().min(1).max(60),
    winCondition: z.enum(['survival', 'damage']),
    skipDisconnected: z.boolean(),
    bots: z.number().int().min(0).max(7),
    visibility: z.enum(['private', 'public']),
  })
  .strict()
  .superRefine((c, ctx) => {
    if (c.mode === 'teams' && c.teams * c.teamSize !== c.maxPlayers)
      ctx.addIssue({ code: 'custom', message: 'Teams × team size must equal the player limit.' });
    if (c.bots >= c.maxPlayers)
      ctx.addIssue({ code: 'custom', message: 'Leave at least one slot for a human.' });
  });
export const commandSchema = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('lock'),
      round: z.number().int().min(1),
      angle: z.number().min(5).max(175),
      power: z.number().min(10).max(100),
      weapon: z.string().max(24),
      ability: z.boolean(),
      targetId: z.string().max(60).optional(),
      superpower: z.boolean().optional(),
      superTargetX: z.number().min(30).max(1410).optional(),
      pass: z.boolean().optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal('move'),
      direction: z.union([z.literal(-1), z.literal(1)]),
      distance: z.number().min(1).max(120),
    })
    .strict(),
  z
    .object({
      type: z.literal('fire'),
      angle: z.number().min(5).max(175),
      power: z.number().min(10).max(100),
      weapon: z.string().max(20),
    })
    .strict(),
  z.object({ type: z.literal('ability'), targetId: z.string().max(60).optional() }).strict(),
  z.object({ type: z.literal('pass') }).strict(),
]);

import { BlockPermutation, GameMode, system, world } from "@minecraft/server";
import { ActionFormData, MessageFormData, ModalFormData } from "@minecraft/server-ui";

const TICKS_PER_SECOND = 20;
const SCHEDULER_INTERVAL = 20;
const SCHEDULE_RETRY_TICKS = 300;
const ADMIN_FORM_DEBOUNCE_TICKS = 10;
const RECENT_HISTORY_SIZE = 5;
const BLOCK_QUEUE_PER_TICK = 48;
const BLOCK_QUEUE_PER_EVENT = 1200;
const DEFAULT_MOB_BUDGET = 24;
const EPICENTER_MIN_DISTANCE = 12;
const EPICENTER_MAX_DISTANCE = 32;
const WORLD_MIN_Y = -64;
const WORLD_MAX_Y = 320;
const SEA_LEVEL_Y = 63;

const ACTIVE_PROPERTY_KEY = "wondercraft:disasters_active";
const HISTORY_PROPERTY_KEY = "wondercraft:disasters_history";
const COOLDOWN_PROPERTY_KEY = "wondercraft:disasters_cooldown";
const CONFIG_PROPERTY_KEY = "wondercraft:disasters_config";
const TEMP_ENTITY_TAG = "wondercraft.disaster_temp";
const ADMIN_TAG = "admin";
const CLOCK_ITEM_ID = "minecraft:clock";

const AIR = "minecraft:air";
const WATER = "minecraft:water";
const LAVA = "minecraft:lava";
const FIRE = "minecraft:fire";
const ICE = "minecraft:ice";
const SOUL_FIRE = "minecraft:soul_fire";
const COBWEB = "minecraft:cobweb";
const SAND = "minecraft:sand";
const RED_SAND = "minecraft:red_sand";
const SNOW = "minecraft:snow";
const SNOW_BLOCK = "minecraft:snow_block";
const STONE = "minecraft:stone";
const COBBLESTONE = "minecraft:cobblestone";
const GRAVEL = "minecraft:gravel";
const DIRT = "minecraft:dirt";
const GRASS_BLOCK = "minecraft:grass_block";
const NETHERRACK = "minecraft:netherrack";
const END_STONE = "minecraft:end_stone";
const MUD = "minecraft:mud";
const MOSS = "minecraft:moss_block";
const POWDER_SNOW = "minecraft:powder_snow";

const DIMENSION_IDS = Object.freeze({
  overworld: "minecraft:overworld",
  nether: "minecraft:nether",
  end: "minecraft:the_end",
});

const AIRLIKE_BLOCKS = new Set([
  AIR,
  "minecraft:cave_air",
  "minecraft:void_air",
  "minecraft:light_block",
  FIRE,
  "minecraft:tallgrass",
  "minecraft:short_grass",
  "minecraft:fern",
  "minecraft:large_fern",
  "minecraft:deadbush",
  "minecraft:snow_layer",
]);

const LIQUID_BLOCKS = new Set([
  WATER,
  "minecraft:flowing_water",
  LAVA,
  "minecraft:flowing_lava",
  "minecraft:bubble_column",
]);

const FLAMMABLE_BLOCK_HINTS = ["_log", "_planks", "_wood", "_leaves", "wool", "hay_block", "bookshelf", "bamboo"];
const GLASS_BLOCK_HINTS = ["glass", "pane"];

const CROP_BLOCKS = new Set([
  "minecraft:wheat",
  "minecraft:carrots",
  "minecraft:potatoes",
  "minecraft:beetroot",
  "minecraft:melon_stem",
  "minecraft:pumpkin_stem",
  "minecraft:sweet_berry_bush",
  "minecraft:cocoa",
  "minecraft:torchflower_crop",
  "minecraft:pitcher_crop",
  "minecraft:reeds",
  "minecraft:bamboo",
  "minecraft:nether_wart",
]);

const DIFFICULTY_SETTINGS = Object.freeze({
  easy: Object.freeze({
    id: "easy",
    label: "Easy",
    minDelayTicks: 7200,
    maxDelayTicks: 10800,
  }),
  mid: Object.freeze({
    id: "mid",
    label: "Mid",
    minDelayTicks: 3600,
    maxDelayTicks: 6000,
  }),
  hard: Object.freeze({
    id: "hard",
    label: "Hard",
    minDelayTicks: 1800,
    maxDelayTicks: 3600,
  }),
});

const DIFFICULTY_IDS = Object.freeze(Object.keys(DIFFICULTY_SETTINGS));

const DISASTER_FX_PROFILE_MAP = Object.freeze({
  sinkhole: "earth",
  earthquake: "earth",
  cave_in: "earth",
  fissure: "earth",
  tectonic_shift: "earth",
  rock_slide: "earth",
  landslide_avalanche: "earth",
  tornado: "storm",
  acid_rain: "storm",
  extreme_winds: "storm",
  blizzard: "storm",
  sandstorm: "storm",
  hurricane: "storm",
  solar_storm: "storm",
  monsoon: "storm",
  frostbite_winds: "storm",
  electromagnetic_storm: "storm",
  hail_storm: "storm",
  water_geyser: "water",
  tsunami: "water",
  underground_flooding: "water",
  acidic_swamps: "water",
  lava_geyser: "fire",
  supernova: "cosmic",
  volcanic_eruption: "fire",
  wildfire: "fire",
  lightning_wildfire: "fire",
  soul_storm: "swarm",
  purge: "swarm",
  infested_caves: "swarm",
  swarming_bees: "swarm",
  black_plague: "fog",
  super_fog: "fog",
  meteor_shower: "cosmic",
  end_storm: "cosmic",
});

const DISASTER_FX_PROFILES = Object.freeze({
  earth: Object.freeze({
    particleInterval: 12,
    particleIds: ["minecraft:basic_smoke_particle"],
    particleCount: 5,
    particleSpread: 4,
    particleHeight: 2,
    soundInterval: 50,
    soundIds: ["dig.stone", "step.stone"],
    volume: 1.1,
    pitchMin: 0.8,
    pitchMax: 1.05,
  }),
  storm: Object.freeze({
    particleInterval: 8,
    particleIds: ["minecraft:basic_smoke_particle"],
    particleCount: 7,
    particleSpread: 6,
    particleHeight: 3,
    soundInterval: 60,
    soundIds: ["ambient.weather.thunder", "ambient.weather.rain"],
    volume: 1.3,
    pitchMin: 0.9,
    pitchMax: 1.15,
  }),
  water: Object.freeze({
    particleInterval: 10,
    particleIds: ["minecraft:water_splash_particle"],
    particleCount: 6,
    particleSpread: 5,
    particleHeight: 2,
    soundInterval: 45,
    soundIds: ["ambient.weather.rain", "bucket.empty_water"],
    volume: 1.0,
    pitchMin: 0.85,
    pitchMax: 1.1,
  }),
  fire: Object.freeze({
    particleInterval: 8,
    particleIds: ["minecraft:basic_flame_particle", "minecraft:lava_particle"],
    particleCount: 6,
    particleSpread: 5,
    particleHeight: 3,
    soundInterval: 40,
    soundIds: ["fire.fire", "random.explode"],
    volume: 1.2,
    pitchMin: 0.85,
    pitchMax: 1.2,
  }),
  swarm: Object.freeze({
    particleInterval: 14,
    particleIds: ["minecraft:basic_smoke_particle"],
    particleCount: 4,
    particleSpread: 4,
    particleHeight: 2,
    soundInterval: 35,
    soundIds: ["mob.bee.loop", "mob.bee.say"],
    volume: 0.9,
    pitchMin: 0.9,
    pitchMax: 1.15,
  }),
  fog: Object.freeze({
    particleInterval: 10,
    particleIds: ["minecraft:basic_smoke_particle"],
    particleCount: 8,
    particleSpread: 7,
    particleHeight: 2,
    soundInterval: 70,
    soundIds: ["ambient.cave", "mob.witch.ambient"],
    volume: 0.8,
    pitchMin: 0.75,
    pitchMax: 1.0,
  }),
  cosmic: Object.freeze({
    particleInterval: 10,
    particleIds: ["minecraft:endrod", "minecraft:portal_directional"],
    particleCount: 6,
    particleSpread: 6,
    particleHeight: 4,
    soundInterval: 50,
    soundIds: ["mob.endermen.portal", "random.explode"],
    volume: 1.2,
    pitchMin: 0.8,
    pitchMax: 1.2,
  }),
});

export const DISASTER_TIER_WEIGHTS = Object.freeze({
  common: 6,
  uncommon: 4,
  rare: 2,
  apocalyptic: 1,
});

export const DISASTER_SENSITIVE_BLOCKS = Object.freeze([
  ...Array.from(CROP_BLOCKS),
  "minecraft:water",
  "minecraft:lava",
  "minecraft:glass",
  "minecraft:glass_pane",
  "minecraft:iron_block",
  "minecraft:gold_block",
  "minecraft:copper_block",
]);

export const DISASTER_SENSITIVE_ITEMS = Object.freeze([
  "minecraft:compass",
  "minecraft:clock",
  "minecraft:iron_sword",
  "minecraft:iron_pickaxe",
  "minecraft:iron_axe",
  "minecraft:iron_shovel",
  "minecraft:iron_helmet",
  "minecraft:iron_chestplate",
  "minecraft:golden_sword",
  "minecraft:golden_pickaxe",
  "minecraft:golden_helmet",
  "minecraft:copper_ingot",
  "minecraft:iron_ingot",
  "minecraft:gold_ingot",
]);

export const METAL_BLOCK_IDS = Object.freeze([
  "minecraft:iron_block",
  "minecraft:gold_block",
  "minecraft:copper_block",
  "minecraft:cut_copper",
  "minecraft:exposed_copper",
  "minecraft:weathered_copper",
  "minecraft:oxidized_copper",
  "minecraft:raw_iron_block",
  "minecraft:raw_gold_block",
  "minecraft:lightning_rod",
  "minecraft:hopper",
  "minecraft:iron_bars",
  "minecraft:chain",
  "minecraft:anvil",
  "minecraft:chipped_anvil",
  "minecraft:damaged_anvil",
]);

export const METAL_ITEM_IDS = Object.freeze([
  "minecraft:iron_ingot",
  "minecraft:gold_ingot",
  "minecraft:copper_ingot",
  "minecraft:iron_sword",
  "minecraft:iron_pickaxe",
  "minecraft:iron_axe",
  "minecraft:iron_shovel",
  "minecraft:iron_helmet",
  "minecraft:iron_chestplate",
  "minecraft:golden_sword",
  "minecraft:golden_pickaxe",
  "minecraft:golden_axe",
  "minecraft:golden_helmet",
  "minecraft:compass",
  "minecraft:clock",
]);

export const TECH_DISABLE_HOOKS = [];

/**
 * @typedef {object} DisasterDefinition
 * @property {string} id
 * @property {string} label
 * @property {"common" | "uncommon" | "rare" | "apocalyptic"} tier
 * @property {number} durationTicks
 * @property {number} blockBudget
 * @property {number} mobBudget
 * @property {(anchor: import("@minecraft/server").Player, context?: object) => boolean} canAnchor
 * @property {(anchor: import("@minecraft/server").Player, context?: object) => { x: number, y: number, z: number } | undefined} selectEpicenter
 * @property {(active: ActiveDisasterState, context: object) => void} start
 * @property {(active: ActiveDisasterState, context: object) => void} tick
 * @property {(active: ActiveDisasterState, context: object) => void} finish
 */

/**
 * @typedef {object} ActiveDisasterState
 * @property {string} disasterId
 * @property {string} dimensionId
 * @property {{ x: number, y: number, z: number }} epicenter
 * @property {number} startedTick
 * @property {number} endTick
 * @property {number} seed
 * @property {number} blockOpsUsed
 * @property {number} mobOpsUsed
 * @property {{ blocks: Array<object>, blockKeys: Record<string, object>, entities: string[] }} tempRefs
 * @property {Record<string, any>} data
 * @property {boolean} [forced]
 * @property {number} [blockBudget]
 * @property {number} [mobBudget]
 */

const runtimeState = {
  active: null,
  recentHistory: [],
  cooldownUntilTick: 0,
  blockQueue: [],
  pendingMessages: [],
  config: null,
};

let initialized = false;
const permutationCache = new Map();
const adminFormState = {
  openPlayers: new Set(),
  useDebounceUntil: new Map(),
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function floorNumber(value) {
  return Math.floor(Number(value) || 0);
}

function floorLocation(location) {
  return {
    x: floorNumber(location.x),
    y: floorNumber(location.y),
    z: floorNumber(location.z),
  };
}

function cloneLocation(location) {
  return {
    x: Number(location.x) || 0,
    y: Number(location.y) || 0,
    z: Number(location.z) || 0,
  };
}

function addLocation(left, right) {
  return {
    x: (left.x || 0) + (right.x || 0),
    y: (left.y || 0) + (right.y || 0),
    z: (left.z || 0) + (right.z || 0),
  };
}

function scaleVector(vector, scale) {
  return {
    x: (vector.x || 0) * scale,
    y: (vector.y || 0) * scale,
    z: (vector.z || 0) * scale,
  };
}

function normalizeVector(vector) {
  const magnitude = Math.sqrt((vector.x || 0) ** 2 + (vector.y || 0) ** 2 + (vector.z || 0) ** 2);
  if (!magnitude) {
    return { x: 0, y: 0, z: 0 };
  }
  return {
    x: (vector.x || 0) / magnitude,
    y: (vector.y || 0) / magnitude,
    z: (vector.z || 0) / magnitude,
  };
}

function distanceSquared(left, right) {
  const dx = (left.x || 0) - (right.x || 0);
  const dy = (left.y || 0) - (right.y || 0);
  const dz = (left.z || 0) - (right.z || 0);
  return dx * dx + dy * dy + dz * dz;
}

function locationKey(location) {
  const point = floorLocation(location);
  return `${point.x},${point.y},${point.z}`;
}

function dimensionLocationKey(dimensionId, location) {
  return `${dimensionId}:${locationKey(location)}`;
}

function hashString(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function createRng(seed) {
  let state = (seed >>> 0) || 1;
  return {
    next() {
      state = Math.imul(state, 1664525) + 1013904223;
      return (state >>> 0) / 4294967296;
    },
    int(min, max) {
      return Math.floor(this.next() * (max - min + 1)) + min;
    },
    pick(values) {
      if (!values.length) {
        return undefined;
      }
      return values[this.int(0, values.length - 1)];
    },
    chance(probability) {
      return this.next() < probability;
    },
    sign() {
      return this.chance(0.5) ? -1 : 1;
    },
  };
}

function currentTick() {
  return Number(system.currentTick ?? 0);
}

function normalizeDifficulty(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (DIFFICULTY_SETTINGS[normalized]) {
    return normalized;
  }
  return "mid";
}

function getDifficultySettings(value) {
  return DIFFICULTY_SETTINGS[normalizeDifficulty(value)];
}

function getDifficultyLabel(value) {
  return getDifficultySettings(value).label;
}

function getDimensionSafe(dimensionId) {
  try {
    return world.getDimension(dimensionId);
  } catch {
    return undefined;
  }
}

function getPermutation(blockId) {
  let permutation = permutationCache.get(blockId);
  if (!permutation) {
    permutation = BlockPermutation.resolve(blockId);
    permutationCache.set(blockId, permutation);
  }
  return permutation;
}

function getBlockSafe(dimension, location) {
  try {
    return dimension.getBlock(floorLocation(location));
  } catch {
    return undefined;
  }
}

function getBlockTypeId(dimension, location) {
  const block = getBlockSafe(dimension, location);
  return block?.typeId || AIR;
}

function isAirLike(typeId) {
  return AIRLIKE_BLOCKS.has(typeId);
}

function isLiquid(typeId) {
  return LIQUID_BLOCKS.has(typeId);
}

function isSolid(typeId) {
  return !!typeId && !isAirLike(typeId) && !isLiquid(typeId);
}

function isFlammable(typeId) {
  return FLAMMABLE_BLOCK_HINTS.some((hint) => typeId.includes(hint));
}

function setBlockDirect(dimension, location, blockId) {
  try {
    dimension.setBlockPermutation(floorLocation(location), getPermutation(blockId));
    return true;
  } catch {
    return false;
  }
}

function canSpendBlockOps(count) {
  const active = runtimeState.active;
  if (!active) {
    return true;
  }
  const budget = active.blockBudget ?? BLOCK_QUEUE_PER_EVENT;
  return active.blockOpsUsed + count <= budget;
}

function enqueueBlockChange(dimensionId, location, blockId) {
  if (!canSpendBlockOps(1)) {
    return false;
  }
  runtimeState.blockQueue.push({
    dimensionId,
    location: floorLocation(location),
    blockId,
  });
  if (runtimeState.active) {
    runtimeState.active.blockOpsUsed += 1;
  }
  return true;
}

function rememberTempBlock(active, dimension, location) {
  const point = floorLocation(location);
  const key = dimensionLocationKey(dimension.id, point);
  if (!active.tempRefs.blockKeys[key]) {
    const ref = {
      dimensionId: dimension.id,
      location: point,
      restoreId: getBlockTypeId(dimension, point),
    };
    active.tempRefs.blockKeys[key] = ref;
    active.tempRefs.blocks.push(ref);
  }
  return active.tempRefs.blockKeys[key];
}

function enqueueTempBlock(active, dimension, location, blockId) {
  if (!canSpendBlockOps(1)) {
    return false;
  }
  rememberTempBlock(active, dimension, location);
  return enqueueBlockChange(dimension.id, location, blockId);
}

function processBlockQueue() {
  let processed = 0;
  while (runtimeState.blockQueue.length && processed < BLOCK_QUEUE_PER_TICK) {
    const entry = runtimeState.blockQueue.shift();
    const dimension = getDimensionSafe(entry.dimensionId);
    if (dimension) {
      setBlockDirect(dimension, entry.location, entry.blockId);
    }
    processed += 1;
  }
}

function cleanupTempRefs(active) {
  if (!active?.tempRefs) {
    return;
  }
  for (const blockRef of active.tempRefs.blocks || []) {
    const dimension = getDimensionSafe(blockRef.dimensionId);
    if (!dimension) {
      continue;
    }
    setBlockDirect(dimension, blockRef.location, blockRef.restoreId || AIR);
  }
  for (const entityId of active.tempRefs.entities || []) {
    try {
      const entity = world.getEntity(entityId);
      entity?.remove();
    } catch {
      // Entity may already be gone.
    }
  }
}

function parseJsonArray(rawValue) {
  if (typeof rawValue !== "string" || !rawValue) {
    return [];
  }
  try {
    const parsed = JSON.parse(rawValue);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function serializeActiveState(active) {
  return {
    ...active,
    epicenter: floorLocation(active.epicenter),
    tempRefs: {
      blocks: (active.tempRefs?.blocks || []).map((entry) => ({
        dimensionId: entry.dimensionId,
        location: floorLocation(entry.location),
        restoreId: entry.restoreId,
      })),
      entities: Array.from(active.tempRefs?.entities || []),
    },
  };
}

function normalizeActiveState(value) {
  const normalized = {
    disasterId: String(value?.disasterId || ""),
    dimensionId: String(value?.dimensionId || DIMENSION_IDS.overworld),
    epicenter: floorLocation(value?.epicenter || { x: 0, y: 64, z: 0 }),
    startedTick: Number(value?.startedTick || 0),
    endTick: Number(value?.endTick || 0),
    seed: Number(value?.seed || 1) || 1,
    blockOpsUsed: Number(value?.blockOpsUsed || 0) || 0,
    mobOpsUsed: Number(value?.mobOpsUsed || 0) || 0,
    tempRefs: {
      blocks: [],
      blockKeys: {},
      entities: Array.isArray(value?.tempRefs?.entities) ? value.tempRefs.entities.slice() : [],
    },
    data: typeof value?.data === "object" && value?.data ? value.data : {},
    forced: !!value?.forced,
    blockBudget: Number(value?.blockBudget || BLOCK_QUEUE_PER_EVENT) || BLOCK_QUEUE_PER_EVENT,
    mobBudget: Number(value?.mobBudget || DEFAULT_MOB_BUDGET) || DEFAULT_MOB_BUDGET,
  };
  for (const blockRef of value?.tempRefs?.blocks || []) {
    const record = {
      dimensionId: String(blockRef.dimensionId || normalized.dimensionId),
      location: floorLocation(blockRef.location || normalized.epicenter),
      restoreId: String(blockRef.restoreId || AIR),
    };
    normalized.tempRefs.blocks.push(record);
    normalized.tempRefs.blockKeys[dimensionLocationKey(record.dimensionId, record.location)] = record;
  }
  return normalized;
}

function saveRuntimeState() {
  try {
    if (runtimeState.active) {
      world.setDynamicProperty(ACTIVE_PROPERTY_KEY, JSON.stringify(serializeActiveState(runtimeState.active)));
    } else {
      world.setDynamicProperty(ACTIVE_PROPERTY_KEY, undefined);
    }
    world.setDynamicProperty(HISTORY_PROPERTY_KEY, JSON.stringify(runtimeState.recentHistory));
    world.setDynamicProperty(COOLDOWN_PROPERTY_KEY, String(runtimeState.cooldownUntilTick));
    world.setDynamicProperty(CONFIG_PROPERTY_KEY, JSON.stringify(getRuntimeConfig()));
  } catch {
    // Dynamic property failures should not crash the runtime.
  }
}

function restoreRuntimeState() {
  try {
    const activeRaw = world.getDynamicProperty(ACTIVE_PROPERTY_KEY);
    const historyRaw = world.getDynamicProperty(HISTORY_PROPERTY_KEY);
    const cooldownRaw = world.getDynamicProperty(COOLDOWN_PROPERTY_KEY);
    const configRaw = world.getDynamicProperty(CONFIG_PROPERTY_KEY);
    runtimeState.recentHistory = parseJsonArray(historyRaw);
    runtimeState.cooldownUntilTick = Number(cooldownRaw || 0) || 0;
    runtimeState.active = typeof activeRaw === "string" && activeRaw ? normalizeActiveState(JSON.parse(activeRaw)) : null;
    runtimeState.config = typeof configRaw === "string" && configRaw
      ? normalizeDisasterConfig(JSON.parse(configRaw))
      : getDefaultDisasterConfig();
  } catch {
    runtimeState.active = null;
    runtimeState.recentHistory = [];
    runtimeState.cooldownUntilTick = 0;
    runtimeState.config = getDefaultDisasterConfig();
  }
}

function queueMessage(message, targetEntityId) {
  runtimeState.pendingMessages.push({ message, targetEntityId });
}

function flushPendingMessages() {
  while (runtimeState.pendingMessages.length) {
    const item = runtimeState.pendingMessages.shift();
    try {
      if (item.targetEntityId) {
        const entity = world.getEntity(item.targetEntityId);
        entity?.sendMessage?.(item.message);
      } else {
        world.sendMessage(item.message);
      }
    } catch {
      // Ignore messaging errors.
    }
  }
}

function getGameModeSafe(player) {
  try {
    return player.getGameMode();
  } catch {
    return undefined;
  }
}

function isParticipant(player) {
  const mode = getGameModeSafe(player);
  return mode === GameMode.Survival || mode === GameMode.Adventure || mode === "survival" || mode === "adventure";
}

function getParticipantPlayers() {
  return world.getAllPlayers().filter(isParticipant);
}

function isLivingEntity(entity) {
  try {
    return !!entity.getComponent("health");
  } catch {
    return false;
  }
}

function forEachLivingEntityInRadius(dimension, center, radius, callback) {
  let entities = [];
  try {
    entities = dimension.getEntities({
      location: floorLocation(center),
      maxDistance: Math.max(1, radius),
    });
  } catch {
    entities = [];
  }
  for (const entity of entities) {
    if (isLivingEntity(entity)) {
      callback(entity);
    }
  }
}

function applyEffectSafe(entity, effectId, durationTicks, amplifier) {
  try {
    entity.addEffect(effectId, durationTicks, { amplifier, showParticles: false });
  } catch {
    // Ignore effect errors.
  }
}

function applyDamageSafe(entity, amount) {
  if (!amount) {
    return;
  }
  try {
    entity.applyDamage(amount);
  } catch {
    // Ignore damage errors.
  }
}

function setOnFireSafe(entity, seconds) {
  try {
    entity.setOnFire(seconds, true);
  } catch {
    // Ignore entities that cannot burn.
  }
}

function applyImpulseSafe(entity, impulse) {
  try {
    entity.applyImpulse(impulse);
    return;
  } catch {
    // Fall back to knockback if available.
  }
  try {
    entity.applyKnockback(impulse.x || 0, impulse.z || 0, Math.sqrt((impulse.x || 0) ** 2 + (impulse.z || 0) ** 2), impulse.y || 0);
  } catch {
    // Ignore.
  }
}

function teleportEntitySafe(entity, location) {
  try {
    entity.teleport(floorLocation(location), {
      dimension: entity.dimension,
      keepVelocity: true,
    });
  } catch {
    // Ignore.
  }
}

function createExplosionSafe(dimension, location, power, causesFire) {
  try {
    dimension.createExplosion(floorLocation(location), power, {
      breaksBlocks: true,
      causesFire: !!causesFire,
    });
  } catch {
    try {
      dimension.runCommandAsync(`summon tnt ${floorNumber(location.x)} ${floorNumber(location.y)} ${floorNumber(location.z)}`);
    } catch {
      // Ignore if commands are unavailable.
    }
  }
}

function summonLightning(dimension, location) {
  try {
    dimension.runCommandAsync(`summon lightning_bolt ${floorNumber(location.x)} ${floorNumber(location.y)} ${floorNumber(location.z)}`);
  } catch {
    // Ignore if the summon fails.
  }
}

function spawnParticleSafe(dimension, particleId, location) {
  if (!particleId) {
    return;
  }
  try {
    dimension.spawnParticle(particleId, cloneLocation(location));
  } catch {
    // Ignore unsupported particle ids or runtimes.
  }
}

function playSoundSafe(dimension, soundId, location, options) {
  if (!soundId) {
    return;
  }
  try {
    dimension.playSound(soundId, cloneLocation(location), options);
  } catch {
    // Ignore unsupported sound ids or runtimes.
  }
}

function sampleFxPoints(center, spread, count, height, rng) {
  const points = [];
  for (let index = 0; index < count; index += 1) {
    points.push({
      x: center.x + rng.int(-spread, spread),
      y: center.y + rng.int(0, height),
      z: center.z + rng.int(-spread, spread),
    });
  }
  return points;
}

function trySpawnTracked(active, dimension, typeId, location) {
  const mobBudget = active.mobBudget ?? DEFAULT_MOB_BUDGET;
  if (active.mobOpsUsed >= mobBudget) {
    return undefined;
  }
  try {
    const entity = dimension.spawnEntity(typeId, floorLocation(location));
    active.mobOpsUsed += 1;
    entity.addTag(TEMP_ENTITY_TAG);
    entity.addTag(`${TEMP_ENTITY_TAG}.${active.disasterId}`);
    active.tempRefs.entities.push(entity.id);
    return entity;
  } catch {
    return undefined;
  }
}

function getWeatherTag(dimension) {
  if (dimension.id !== DIMENSION_IDS.overworld) {
    return "clear";
  }
  try {
    const weather = String(dimension.getWeather()).toLowerCase();
    if (weather.includes("thunder")) {
      return "thunder";
    }
    if (weather.includes("rain")) {
      return "rain";
    }
  } catch {
    // Fall back to clear.
  }
  return "clear";
}

function getTimePhase() {
  try {
    const timeOfDay = Number(world.getTimeOfDay?.() ?? 0) % 24000;
    return timeOfDay >= 1000 && timeOfDay < 13000 ? "day" : "night";
  } catch {
    return "day";
  }
}

function hasSolidCeiling(dimension, location, minOffset, maxOffset) {
  for (let offset = minOffset; offset <= maxOffset; offset += 1) {
    const typeId = getBlockTypeId(dimension, { x: location.x, y: location.y + offset, z: location.z });
    if (isSolid(typeId)) {
      return true;
    }
  }
  return false;
}

function findSurfaceStandingLocation(dimension, x, z, anchorY) {
  const minY = clamp(floorNumber(anchorY) - 32, WORLD_MIN_Y + 1, WORLD_MAX_Y - 2);
  const maxY = clamp(floorNumber(anchorY) + 32, WORLD_MIN_Y + 1, WORLD_MAX_Y - 2);
  for (let y = maxY; y >= minY; y -= 1) {
    const below = getBlockTypeId(dimension, { x, y: y - 1, z });
    const feet = getBlockTypeId(dimension, { x, y, z });
    const head = getBlockTypeId(dimension, { x, y: y + 1, z });
    if (isSolid(below) && isAirLike(feet) && isAirLike(head)) {
      return { x, y, z };
    }
  }
  return undefined;
}

function findCaveStandingLocation(dimension, x, z, anchorY) {
  const minY = clamp(floorNumber(anchorY) - 48, WORLD_MIN_Y + 1, WORLD_MAX_Y - 3);
  const maxY = clamp(floorNumber(anchorY) + 8, WORLD_MIN_Y + 1, WORLD_MAX_Y - 3);
  for (let y = maxY; y >= minY; y -= 1) {
    const feet = getBlockTypeId(dimension, { x, y, z });
    const head = getBlockTypeId(dimension, { x, y: y + 1, z });
    const floorType = getBlockTypeId(dimension, { x, y: y - 1, z });
    if (!isAirLike(feet) || !isAirLike(head) || !isSolid(floorType)) {
      continue;
    }
    if (hasSolidCeiling(dimension, { x, y, z }, 2, 8)) {
      return { x, y, z };
    }
  }
  return undefined;
}

function isExposedToSky(dimension, location) {
  const point = floorLocation(location);
  for (let y = point.y + 1; y <= clamp(point.y + 20, WORLD_MIN_Y, WORLD_MAX_Y); y += 1) {
    const typeId = getBlockTypeId(dimension, { x: point.x, y, z: point.z });
    if (isSolid(typeId) || isLiquid(typeId)) {
      return false;
    }
  }
  return true;
}

function isNearWater(dimension, location, radius) {
  for (let dx = -radius; dx <= radius; dx += 1) {
    for (let dz = -radius; dz <= radius; dz += 1) {
      for (let dy = -2; dy <= 2; dy += 1) {
        const typeId = getBlockTypeId(dimension, {
          x: location.x + dx,
          y: location.y + dy,
          z: location.z + dz,
        });
        if (typeId === WATER || typeId === "minecraft:flowing_water") {
          return true;
        }
      }
    }
  }
  return false;
}

function getTerrainTags(dimension, location) {
  const tags = new Set();
  const heights = [];
  let sandCount = 0;
  let redSandCount = 0;
  let snowCount = 0;
  let stoneCount = 0;
  let waterCount = 0;
  let leafCount = 0;
  let logCount = 0;
  let flowerCount = 0;
  let mudCount = 0;
  let netherCount = 0;
  let endCount = 0;
  let plainsCount = 0;

  for (let dx = -6; dx <= 6; dx += 3) {
    for (let dz = -6; dz <= 6; dz += 3) {
      const stand = findSurfaceStandingLocation(dimension, floorNumber(location.x) + dx, floorNumber(location.z) + dz, location.y);
      const sampleY = stand ? stand.y : floorNumber(location.y);
      heights.push(sampleY);
      const groundType = getBlockTypeId(dimension, { x: floorNumber(location.x) + dx, y: sampleY - 1, z: floorNumber(location.z) + dz });
      if (groundType === SAND) sandCount += 1;
      if (groundType === RED_SAND || groundType.includes("terracotta")) redSandCount += 1;
      if (groundType === SNOW || groundType === SNOW_BLOCK || groundType === ICE || groundType === POWDER_SNOW) snowCount += 1;
      if (groundType === STONE || groundType === COBBLESTONE || groundType === GRAVEL || groundType.endsWith("_ore")) stoneCount += 1;
      if (groundType === WATER || groundType === "minecraft:flowing_water") waterCount += 1;
      if (groundType === MUD || groundType.includes("mangrove") || groundType.includes("clay")) mudCount += 1;
      if (groundType === NETHERRACK || groundType.includes("blackstone") || groundType.includes("basalt")) netherCount += 1;
      if (groundType === END_STONE) endCount += 1;
      if (groundType === GRASS_BLOCK || groundType === DIRT || groundType.includes("grass")) plainsCount += 1;

      const headType = getBlockTypeId(dimension, { x: floorNumber(location.x) + dx, y: sampleY, z: floorNumber(location.z) + dz });
      if (headType.includes("flower") || headType === "minecraft:dandelion" || headType === "minecraft:poppy") flowerCount += 1;
      if (headType.includes("leaves")) leafCount += 1;
      if (headType.includes("log") || headType.includes("stem")) logCount += 1;
    }
  }

  if (sandCount >= 4) tags.add("desert");
  if (redSandCount >= 3) tags.add("badlands");
  if (snowCount >= 3) {
    tags.add("snowy");
    tags.add("frozen");
  }
  if (stoneCount >= 4) tags.add("rocky");
  if (waterCount >= 4) tags.add("ocean");
  if (waterCount >= 2) {
    tags.add("coast");
    tags.add("water");
  }
  if (leafCount + logCount >= 3) tags.add("forest");
  if (flowerCount >= 2) tags.add("flower");
  if (mudCount >= 2) tags.add("swamp");
  if (plainsCount >= 4) tags.add("plains");
  if (netherCount >= 2) tags.add("nether");
  if (endCount >= 2) tags.add("end");

  const minHeight = heights.length ? Math.min(...heights) : location.y;
  const maxHeight = heights.length ? Math.max(...heights) : location.y;
  if (maxHeight - minHeight >= 5) tags.add("slope");
  if (location.y >= 90) tags.add("mountain");
  if (!isExposedToSky(dimension, location) || location.y < 55) {
    tags.add("cave");
  } else {
    tags.add("surface");
  }

  return Array.from(tags);
}

function estimateSlopeDirection(dimension, location) {
  const samples = [
    { x: 1, z: 0 },
    { x: -1, z: 0 },
    { x: 0, z: 1 },
    { x: 0, z: -1 },
  ];
  let bestVector = { x: 1, y: 0, z: 0 };
  let biggestDrop = -9999;
  const origin = findSurfaceStandingLocation(dimension, location.x, location.z, location.y) || floorLocation(location);
  for (const sample of samples) {
    const stand = findSurfaceStandingLocation(dimension, location.x + sample.x * 6, location.z + sample.z * 6, location.y) || origin;
    const drop = origin.y - stand.y;
    if (drop > biggestDrop) {
      biggestDrop = drop;
      bestVector = { x: sample.x, y: 0, z: sample.z };
    }
  }
  return normalizeVector(bestVector);
}

function sampleRingOffset(rng) {
  const distance = rng.int(EPICENTER_MIN_DISTANCE, EPICENTER_MAX_DISTANCE);
  const angle = rng.next() * Math.PI * 2;
  return {
    x: Math.round(Math.cos(angle) * distance),
    y: 0,
    z: Math.round(Math.sin(angle) * distance),
  };
}

function matchesTerrainRequirement(config, terrainTags) {
  if (!config.terrainAny?.length) {
    return true;
  }
  return config.terrainAny.some((tag) => terrainTags.includes(tag));
}

function matchesRequirementAt(dimension, location, config) {
  if (config.minY !== undefined && location.y < config.minY) return false;
  if (config.maxY !== undefined && location.y > config.maxY) return false;
  if (config.requiresOpenSky && !isExposedToSky(dimension, location)) return false;
  if (config.requiresUnderground && isExposedToSky(dimension, location)) return false;
  if (config.nearWater && !isNearWater(dimension, location, config.nearWaterRadius || 6)) return false;
  if (config.nearSeaLevel && Math.abs(location.y - SEA_LEVEL_Y) > 8) return false;
  return matchesTerrainRequirement(config, getTerrainTags(dimension, location));
}

function selectEpicenterForConfig(config, anchor, rng) {
  if (!config.dimensionIds.includes(anchor.dimension.id)) {
    return undefined;
  }
  const dimension = anchor.dimension;
  const attempts = config.selectAttempts || 14;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const offset = config.strategy === "near_anchor" ? { x: 0, y: 0, z: 0 } : sampleRingOffset(rng);
    const baseX = floorNumber(anchor.location.x) + offset.x;
    const baseZ = floorNumber(anchor.location.z) + offset.z;
    let location;

    if (config.strategy === "cave") {
      location = findCaveStandingLocation(dimension, baseX, baseZ, anchor.location.y);
    } else if (config.strategy === "surface_or_cave") {
      location = findSurfaceStandingLocation(dimension, baseX, baseZ, anchor.location.y) || findCaveStandingLocation(dimension, baseX, baseZ, anchor.location.y);
    } else {
      location = findSurfaceStandingLocation(dimension, baseX, baseZ, anchor.location.y);
    }

    if (!location && config.strategy === "near_anchor") {
      location = isExposedToSky(dimension, anchor.location)
        ? findSurfaceStandingLocation(dimension, floorNumber(anchor.location.x), floorNumber(anchor.location.z), anchor.location.y)
        : findCaveStandingLocation(dimension, floorNumber(anchor.location.x), floorNumber(anchor.location.z), anchor.location.y);
    }

    if (!location) {
      continue;
    }
    if (config.avoidWaterSurface) {
      const feetType = getBlockTypeId(dimension, location);
      const floorType = getBlockTypeId(dimension, { x: location.x, y: location.y - 1, z: location.z });
      if (isLiquid(feetType) || isLiquid(floorType)) {
        continue;
      }
    }
    if (!matchesRequirementAt(dimension, location, config)) {
      continue;
    }
    return {
      location,
      terrainTags: getTerrainTags(dimension, location),
      slopeVector: estimateSlopeDirection(dimension, location),
    };
  }
  return undefined;
}

function getOrCreateExposureMap(active, key) {
  if (!active.data[key]) {
    active.data[key] = {};
  }
  return active.data[key];
}

function updateExposure(active, mapKey, entityId, exposed) {
  const map = getOrCreateExposureMap(active, mapKey);
  map[entityId] = exposed ? Number(map[entityId] || 0) + 1 : 0;
  return map[entityId];
}

function queueDiscRemoval(dimension, center, radiusX, radiusZ, depthResolver, lavaBottom) {
  for (let dx = -radiusX; dx <= radiusX; dx += 1) {
    for (let dz = -radiusZ; dz <= radiusZ; dz += 1) {
      const nx = radiusX ? dx / radiusX : 0;
      const nz = radiusZ ? dz / radiusZ : 0;
      const distance = Math.sqrt(nx * nx + nz * nz);
      if (distance > 1.1) {
        continue;
      }
      const stand = findSurfaceStandingLocation(dimension, center.x + dx, center.z + dz, center.y) || { x: center.x + dx, y: center.y, z: center.z + dz };
      const depth = depthResolver(distance, stand);
      for (let depthIndex = 1; depthIndex <= depth; depthIndex += 1) {
        enqueueBlockChange(dimension.id, { x: stand.x, y: stand.y - depthIndex, z: stand.z }, AIR);
      }
      if (lavaBottom && distance < 0.4) {
        enqueueBlockChange(dimension.id, { x: stand.x, y: stand.y - depth, z: stand.z }, LAVA);
      }
    }
  }
}

function createLinePoints(center, axis, length, width) {
  const points = [];
  const halfLength = Math.floor(length / 2);
  const halfWidth = Math.floor(width / 2);
  const isXAxis = Math.abs(axis.x) > Math.abs(axis.z);
  for (let line = -halfLength; line <= halfLength; line += 1) {
    for (let lateral = -halfWidth; lateral <= halfWidth; lateral += 1) {
      points.push({
        x: center.x + (isXAxis ? line : lateral),
        y: center.y,
        z: center.z + (isXAxis ? lateral : line),
      });
    }
  }
  return points;
}

function queueTrench(dimension, center, axis, length, width, depth, lavaBottom) {
  for (const point of createLinePoints(center, axis, length, width)) {
    const stand = findSurfaceStandingLocation(dimension, point.x, point.z, center.y) || point;
    for (let depthIndex = 1; depthIndex <= depth; depthIndex += 1) {
      enqueueBlockChange(dimension.id, { x: stand.x, y: stand.y - depthIndex, z: stand.z }, AIR);
    }
    if (lavaBottom) {
      enqueueBlockChange(dimension.id, { x: stand.x, y: stand.y - depth, z: stand.z }, LAVA);
    }
  }
}

function queueRidge(dimension, center, axis, length, offset, material) {
  const isXAxis = Math.abs(axis.x) > Math.abs(axis.z);
  const halfLength = Math.floor(length / 2);
  for (let line = -halfLength; line <= halfLength; line += 1) {
    const base = {
      x: center.x + (isXAxis ? line : offset),
      y: center.y,
      z: center.z + (isXAxis ? offset : line),
    };
    const stand = findSurfaceStandingLocation(dimension, base.x, base.z, center.y) || base;
    enqueueBlockChange(dimension.id, { x: stand.x, y: stand.y - 1, z: stand.z }, material);
    enqueueBlockChange(dimension.id, { x: stand.x, y: stand.y, z: stand.z }, material);
  }
}

function queueSlideLane(active, dimension, center, direction, length, width, material) {
  const dir = normalizeVector(direction);
  const lateral = { x: -dir.z, y: 0, z: dir.x };
  const halfWidth = Math.floor(width / 2);
  for (let step = 0; step < length; step += 1) {
    for (let lateralStep = -halfWidth; lateralStep <= halfWidth; lateralStep += 1) {
      const x = center.x + Math.round(dir.x * step + lateral.x * lateralStep);
      const z = center.z + Math.round(dir.z * step + lateral.z * lateralStep);
      const stand = findSurfaceStandingLocation(dimension, x, z, center.y) || { x, y: center.y, z };
      enqueueBlockChange(dimension.id, { x: stand.x, y: stand.y - 1, z: stand.z }, material);
      enqueueBlockChange(dimension.id, { x: stand.x, y: stand.y, z: stand.z }, material);
    }
  }
  if (active.data) {
    active.data.slideVector = dir;
  }
}

function sampleSurfacePositions(dimension, center, radius, count, rng) {
  const positions = [];
  for (let index = 0; index < count; index += 1) {
    const offset = { x: rng.int(-radius, radius), y: 0, z: rng.int(-radius, radius) };
    const stand = findSurfaceStandingLocation(dimension, center.x + offset.x, center.z + offset.z, center.y);
    if (stand) {
      positions.push(stand);
    }
  }
  return positions;
}

function sampleCavePositions(dimension, center, radius, count, rng) {
  const positions = [];
  for (let index = 0; index < count; index += 1) {
    const offset = { x: rng.int(-radius, radius), y: 0, z: rng.int(-radius, radius) };
    const stand = findCaveStandingLocation(dimension, center.x + offset.x, center.z + offset.z, center.y);
    if (stand) {
      positions.push(stand);
    }
  }
  return positions;
}

function applyWindImpulse(entity, origin, strength, vertical, mode, sign) {
  const location = cloneLocation(entity.location);
  const toCenter = normalizeVector({
    x: origin.x - location.x,
    y: 0,
    z: origin.z - location.z,
  });
  let impulse;
  if (mode === "swirl") {
    impulse = {
      x: -toCenter.z * strength * sign + toCenter.x * strength * 0.35,
      y: vertical,
      z: toCenter.x * strength * sign + toCenter.z * strength * 0.35,
    };
  } else if (mode === "pull") {
    impulse = { x: toCenter.x * strength, y: vertical, z: toCenter.z * strength };
  } else if (mode === "push") {
    impulse = { x: -toCenter.x * strength, y: vertical, z: -toCenter.z * strength };
  } else {
    impulse = { x: sign * strength, y: vertical, z: sign * strength * 0.5 };
  }
  applyImpulseSafe(entity, impulse);
}

function placeFireIfPossible(active, dimension, location) {
  const feet = floorLocation(location);
  if (!isAirLike(getBlockTypeId(dimension, feet))) {
    return;
  }
  const floorType = getBlockTypeId(dimension, { x: feet.x, y: feet.y - 1, z: feet.z });
  if (!isSolid(floorType)) {
    return;
  }
  enqueueTempBlock(active, dimension, feet, FIRE);
}

function breakCropsAround(dimension, location) {
  for (let dx = -1; dx <= 1; dx += 1) {
    for (let dz = -1; dz <= 1; dz += 1) {
      const blockLocation = { x: location.x + dx, y: location.y, z: location.z + dz };
      const typeId = getBlockTypeId(dimension, blockLocation);
      if (CROP_BLOCKS.has(typeId)) {
        enqueueBlockChange(dimension.id, blockLocation, AIR);
      }
    }
  }
}

function breakGlassAround(dimension, location) {
  for (let dx = -1; dx <= 1; dx += 1) {
    for (let dy = 0; dy <= 1; dy += 1) {
      for (let dz = -1; dz <= 1; dz += 1) {
        const blockLocation = { x: location.x + dx, y: location.y + dy, z: location.z + dz };
        const typeId = getBlockTypeId(dimension, blockLocation);
        if (GLASS_BLOCK_HINTS.some((hint) => typeId.includes(hint))) {
          enqueueBlockChange(dimension.id, blockLocation, AIR);
        }
      }
    }
  }
}

function corrodeNearbyBlocks(dimension, center, radius, rng) {
  const samples = sampleSurfacePositions(dimension, center, radius, 12, rng);
  for (const point of samples) {
    breakCropsAround(dimension, point);
    const floorLocationBelow = { x: point.x, y: point.y - 1, z: point.z };
    const floorType = getBlockTypeId(dimension, floorLocationBelow);
    if (METAL_BLOCK_IDS.includes(floorType)) {
      enqueueBlockChange(dimension.id, floorLocationBelow, AIR);
    }
  }
}

function encaseEntityInIce(active, dimension, entity) {
  const origin = floorLocation(entity.location);
  const offsets = [
    { x: 1, y: 0, z: 0 },
    { x: -1, y: 0, z: 0 },
    { x: 0, y: 0, z: 1 },
    { x: 0, y: 0, z: -1 },
    { x: 0, y: 1, z: 0 },
  ];
  for (const offset of offsets) {
    const location = addLocation(origin, offset);
    if (isAirLike(getBlockTypeId(dimension, location))) {
      enqueueTempBlock(active, dimension, location, ICE);
    }
  }
}

function inventoryContainsAny(player, itemIds) {
  try {
    const component = player.getComponent("inventory");
    const container = component?.container;
    if (!container) {
      return false;
    }
    for (let index = 0; index < container.size; index += 1) {
      const item = container.getItem(index);
      if (item && itemIds.includes(item.typeId)) {
        return true;
      }
    }
  } catch {
    // Ignore inventory lookup failures.
  }
  return false;
}

function callTechDisableHooks(context) {
  for (const hook of TECH_DISABLE_HOOKS) {
    try {
      hook(context);
    } catch {
      // Future hooks should not crash the disaster runtime.
    }
  }
}

// __CORE__
// __CORE__
function buildSinkholeHandler(config) {
  return {
    start(active, context) {
      const radiusX = context.rng.int(3, 4);
      const radiusZ = context.rng.int(3, 4);
      const depth = context.rng.int(config.depthMin, config.depthMax);
      active.data.radius = Math.max(radiusX, radiusZ);
      active.data.depth = depth;
      queueDiscRemoval(context.dimension, active.epicenter, radiusX, radiusZ, (distance) => clamp(Math.floor(depth * (1.15 - distance * 0.75)), 3, depth), false);
    },
    tick(active, context) {
      if (context.elapsed % 10 !== 0) {
        return;
      }
      forEachLivingEntityInRadius(context.dimension, active.epicenter, (active.data.radius || 5) + 3, (entity) => {
        applyImpulseSafe(entity, { x: 0, y: -0.18, z: 0 });
      });
    },
    finish() {},
  };
}

function buildEarthquakeHandler(config) {
  return {
    start(active, context) {
      active.data.pulseTicks = [20, 80, 140, 200, 260, 320];
      active.data.lastPulseTick = -1;
      active.data.axis = context.rng.chance(0.5) ? { x: 1, y: 0, z: 0 } : { x: 0, y: 0, z: 1 };
    },
    tick(active, context) {
      const pulseTick = (active.data.pulseTicks || []).find((value) => value > active.data.lastPulseTick && value <= context.elapsed);
      if (pulseTick === undefined) {
        return;
      }
      active.data.lastPulseTick = pulseTick;
      forEachLivingEntityInRadius(context.dimension, active.epicenter, config.radius, (entity) => {
        applyImpulseSafe(entity, {
          x: (context.rng.next() - 0.5) * 0.85,
          y: 0.35,
          z: (context.rng.next() - 0.5) * 0.85,
        });
        applyEffectSafe(entity, "minecraft:slowness", 40, 1);
      });
      queueTrench(context.dimension, active.epicenter, active.data.axis, 14, 1, 2, false);
      const caveInPoints = sampleSurfacePositions(context.dimension, active.epicenter, 8, 8, context.rng);
      for (const point of caveInPoints) {
        for (let depthIndex = 0; depthIndex < 3; depthIndex += 1) {
          enqueueBlockChange(context.dimension.id, { x: point.x, y: point.y - depthIndex - 1, z: point.z }, AIR);
        }
      }
    },
    finish() {},
  };
}

function buildTornadoHandler(config) {
  return {
    start(active, context) {
      active.data.spin = context.rng.sign();
      active.data.travel = normalizeVector({
        x: context.rng.int(-10, 10) || 1,
        y: 0,
        z: context.rng.int(-10, 10) || 1,
      });
    },
    tick(active, context) {
      if (context.elapsed % 20 === 0) {
        const target = addLocation(active.epicenter, active.data.travel);
        const stand = findSurfaceStandingLocation(context.dimension, floorNumber(target.x), floorNumber(target.z), active.epicenter.y);
        if (stand) {
          active.epicenter = stand;
        }
      }
      forEachLivingEntityInRadius(context.dimension, active.epicenter, config.radius, (entity) => {
        applyWindImpulse(entity, active.epicenter, 0.22, 0.16, "swirl", active.data.spin || 1);
      });
      if (context.elapsed % 30 === 0) {
        const positions = sampleSurfacePositions(context.dimension, active.epicenter, 10, 8, context.rng);
        for (const point of positions) {
          const floorType = getBlockTypeId(context.dimension, { x: point.x, y: point.y - 1, z: point.z });
          if (floorType === GRASS_BLOCK || floorType === DIRT || floorType === SAND || floorType.includes("leaves") || CROP_BLOCKS.has(floorType)) {
            enqueueBlockChange(context.dimension.id, { x: point.x, y: point.y - 1, z: point.z }, AIR);
          }
        }
      }
    },
    finish() {},
  };
}

function buildCaveInHandler(config) {
  return {
    start(active, context) {
      active.data.columns = sampleCavePositions(context.dimension, active.epicenter, 10, 18, context.rng);
      for (const point of active.data.columns) {
        let ceilingY = point.y + 2;
        while (ceilingY < point.y + 9 && !isSolid(getBlockTypeId(context.dimension, { x: point.x, y: ceilingY, z: point.z }))) {
          ceilingY += 1;
        }
        const columnHeight = context.rng.int(4, 8);
        for (let step = 0; step < columnHeight; step += 1) {
          enqueueBlockChange(context.dimension.id, { x: point.x, y: ceilingY - step, z: point.z }, GRAVEL);
        }
      }
    },
    tick(active, context) {
      if (context.elapsed % 20 !== 0) {
        return;
      }
      forEachLivingEntityInRadius(context.dimension, active.epicenter, config.radius, (entity) => {
        applyDamageSafe(entity, 2);
        applyEffectSafe(entity, "minecraft:slowness", 40, 2);
      });
    },
    finish() {},
  };
}

function buildGeyserHandler(config) {
  return {
    start(active) {
      active.data.burstTicks = config.burstTicks.slice();
      active.data.lastBurst = -1;
      active.data.columnHeight = config.columnHeight;
    },
    tick(active, context) {
      const pendingBurst = active.data.burstTicks.find((value) => value > active.data.lastBurst && value <= context.elapsed);
      if (pendingBurst === undefined) {
        return;
      }
      active.data.lastBurst = pendingBurst;
      for (let step = 0; step < active.data.columnHeight; step += 1) {
        enqueueTempBlock(active, context.dimension, { x: active.epicenter.x, y: active.epicenter.y + step, z: active.epicenter.z }, config.blockId);
      }
      forEachLivingEntityInRadius(context.dimension, active.epicenter, config.radius, (entity) => {
        applyImpulseSafe(entity, { x: 0, y: config.verticalImpulse, z: 0 });
        if (config.fireSeconds) {
          setOnFireSafe(entity, config.fireSeconds);
        }
      });
    },
    finish() {},
  };
}

function buildStatusStormHandler(config) {
  return {
    start(active, context) {
      active.data.windSign = context.rng.sign();
      active.data.windVector = normalizeVector({
        x: context.rng.int(-10, 10) || 1,
        y: 0,
        z: context.rng.int(-10, 10) || 1,
      });
      if (config.generatePools) {
        active.data.pools = sampleSurfacePositions(context.dimension, active.epicenter, 10, config.generatePools, context.rng);
      }
    },
    tick(active, context) {
      const exposureKey = `${config.id}_exposure`;
      forEachLivingEntityInRadius(context.dimension, active.epicenter, config.radius, (entity) => {
        const entityLocation = cloneLocation(entity.location);
        const exposed = !config.exposedOnly || isExposedToSky(context.dimension, entityLocation);
        const exposureTicks = updateExposure(active, exposureKey, entity.id, exposed);
        if (!exposed && config.exposedOnly) {
          return;
        }
        for (const effect of config.effects || []) {
          applyEffectSafe(entity, effect.id, effect.durationTicks, effect.amplifier);
        }
        if (config.damageInterval && exposureTicks && exposureTicks % config.damageInterval === 0) {
          applyDamageSafe(entity, config.damageAmount);
        }
        if (config.knockbackInterval && context.elapsed % config.knockbackInterval === 0) {
          if (config.knockbackMode === "directional") {
            const impulse = scaleVector(active.data.windVector, config.knockbackStrength || 0.2);
            impulse.y = config.knockbackVertical || 0;
            applyImpulseSafe(entity, impulse);
          } else {
            applyWindImpulse(entity, active.epicenter, config.knockbackStrength || 0.2, config.knockbackVertical || 0, config.knockbackMode || "push", active.data.windSign || 1);
          }
        }
        if (config.fireExposureInterval && exposureTicks && exposureTicks % config.fireExposureInterval === 0) {
          setOnFireSafe(entity, config.fireSeconds || 4);
        }
        if (config.encaseAfterExposure && exposureTicks >= config.encaseAfterExposure) {
          const encasedMap = getOrCreateExposureMap(active, `${config.id}_encased`);
          if (!encasedMap[entity.id]) {
            encaseEntityInIce(active, context.dimension, entity);
            encasedMap[entity.id] = 1;
          }
        }
        if (config.inventoryWarning && entity.typeId === "minecraft:player" && inventoryContainsAny(entity, config.inventoryWarning)) {
          queueMessage(config.inventoryWarningMessage, entity.id);
        }
      });

      if (config.worldPulseInterval && context.elapsed % config.worldPulseInterval === 0) {
        const samples = sampleSurfacePositions(context.dimension, active.epicenter, Math.max(4, Math.floor(config.radius / 2)), config.worldPulseCount || 6, context.rng);
        for (const point of samples) {
          if (config.freezeWater) {
            for (let dx = -1; dx <= 1; dx += 1) {
              for (let dz = -1; dz <= 1; dz += 1) {
                const location = { x: point.x + dx, y: point.y - 1, z: point.z + dz };
                const floorType = getBlockTypeId(context.dimension, location);
                if (floorType === WATER || floorType === "minecraft:flowing_water") {
                  enqueueBlockChange(context.dimension.id, location, ICE);
                }
              }
            }
          }
          if (config.tempBlockId) {
            const placeLocation = { x: point.x, y: point.y, z: point.z };
            if (isAirLike(getBlockTypeId(context.dimension, placeLocation))) {
              enqueueTempBlock(active, context.dimension, placeLocation, config.tempBlockId);
            }
          }
          if (config.firePulse) {
            placeFireIfPossible(active, context.dimension, point);
          }
          if (config.floodPulse && isAirLike(getBlockTypeId(context.dimension, point))) {
            enqueueTempBlock(active, context.dimension, point, WATER);
          }
          if (config.destroyCrops) {
            breakCropsAround(context.dimension, point);
          }
          if (config.corrodeBlocks) {
            corrodeNearbyBlocks(context.dimension, point, 4, context.rng);
          }
          if (config.breakGlass) {
            breakGlassAround(context.dimension, point);
          }
          if (config.lightningPulse) {
            summonLightning(context.dimension, point);
          }
        }
      }

      if (config.techPulseInterval && context.elapsed % config.techPulseInterval === 0) {
        callTechDisableHooks({
          disasterId: active.disasterId,
          dimension: context.dimension,
          epicenter: cloneLocation(active.epicenter),
        });
      }

      if (config.poolDamage && Array.isArray(active.data.pools)) {
        forEachLivingEntityInRadius(context.dimension, active.epicenter, config.radius, (entity) => {
          for (const pool of active.data.pools) {
            if (distanceSquared(entity.location, pool) <= 9) {
              applyDamageSafe(entity, config.poolDamage);
              applyEffectSafe(entity, "minecraft:nausea", 60, 0);
              break;
            }
          }
        });
      }
    },
    finish() {},
  };
}

function countLivingEntitiesInRadius(dimension, center, radius) {
  let count = 0;
  forEachLivingEntityInRadius(dimension, center, radius, () => {
    count += 1;
  });
  return count;
}

function getParticipantPlayersInRadius(dimension, center, radius) {
  return getParticipantPlayers().filter((player) => {
    return player.dimension.id === dimension.id && distanceSquared(player.location, center) <= radius * radius;
  });
}

function queueFireBlock(active, dimension, location, temporary, blockId) {
  const feet = floorLocation(location);
  if (!isAirLike(getBlockTypeId(dimension, feet))) {
    return false;
  }
  const floorType = getBlockTypeId(dimension, { x: feet.x, y: feet.y - 1, z: feet.z });
  if (!isSolid(floorType) && !isFlammable(floorType)) {
    return false;
  }
  if (temporary) {
    return !!active && enqueueTempBlock(active, dimension, feet, blockId);
  }
  return enqueueBlockChange(dimension.id, feet, blockId);
}

function queueSparseCrater(dimension, center, radius, depth, sampleCount, rng, lavaBottom) {
  const points = sampleSurfacePositions(dimension, center, radius, sampleCount, rng);
  for (const point of points) {
    const distance = Math.sqrt(distanceSquared(point, center));
    const ratio = clamp(distance / Math.max(1, radius), 0, 1);
    const craterDepth = clamp(Math.floor(depth * (1.2 - ratio * 0.7)), 2, depth);
    for (let step = 1; step <= craterDepth; step += 1) {
      enqueueBlockChange(dimension.id, { x: point.x, y: point.y - step, z: point.z }, AIR);
    }
    if (lavaBottom && ratio < 0.35) {
      enqueueBlockChange(dimension.id, { x: point.x, y: point.y - craterDepth, z: point.z }, LAVA);
    }
  }
}

function spawnConfiguredWave(active, dimension, centers, config, rng) {
  const spawnTypes = config.spawnTypes || [];
  if (!spawnTypes.length) {
    return;
  }
  const spawnCountPerCenter = Math.max(1, config.spawnCountPerCenter || 1);
  for (const center of centers) {
    if (active.mobOpsUsed >= (active.mobBudget ?? DEFAULT_MOB_BUDGET)) {
      return;
    }
    const sampleCount = Math.max(spawnCountPerCenter * 2, spawnCountPerCenter + 2);
    const positions = config.useCaves
      ? sampleCavePositions(dimension, center, config.spawnRadius || 8, sampleCount, rng)
      : sampleSurfacePositions(dimension, center, config.spawnRadius || 8, sampleCount, rng);
    let spawned = 0;
    for (const position of positions) {
      const typeId = rng.pick(spawnTypes);
      const entity = trySpawnTracked(active, dimension, typeId, position);
      if (!entity) {
        continue;
      }
      spawned += 1;
      if (config.spawnEffect) {
        applyEffectSafe(entity, config.spawnEffect.id, config.spawnEffect.durationTicks, config.spawnEffect.amplifier);
      }
      if (config.spawnFireSeconds) {
        setOnFireSafe(entity, config.spawnFireSeconds);
      }
      if (config.spawnEvent) {
        try {
          entity.triggerEvent(config.spawnEvent);
        } catch {
          // Ignore missing or unsupported events.
        }
      }
      if (spawned >= spawnCountPerCenter) {
        break;
      }
    }
  }
}

function buildTerrainSplitHandler(config) {
  return {
    start(active, context) {
      const storedSlope = normalizeVector(active.data.slopeVector || { x: 0, y: 0, z: 0 });
      const fallbackAxis = context.rng.chance(0.5) ? { x: 1, y: 0, z: 0 } : { x: 0, y: 0, z: 1 };
      active.data.axis = Math.abs(storedSlope.x) + Math.abs(storedSlope.z) > 0 ? storedSlope : fallbackAxis;
      if (config.mode === "fissure") {
        active.data.depth = context.rng.int(config.depthMin, config.depthMax);
        active.data.lavaBottom = !!config.lavaBottomChance && context.rng.chance(config.lavaBottomChance);
        queueTrench(
          context.dimension,
          active.epicenter,
          active.data.axis,
          config.length,
          config.width,
          active.data.depth,
          active.data.lavaBottom
        );
      } else {
        active.data.offset = context.rng.int(config.offsetMin, config.offsetMax);
        queueTrench(context.dimension, active.epicenter, active.data.axis, config.areaSize, 2, 3, false);
        queueRidge(context.dimension, active.epicenter, active.data.axis, config.areaSize, active.data.offset, config.material);
        queueRidge(context.dimension, active.epicenter, active.data.axis, config.areaSize, -active.data.offset, config.material);
      }
    },
    tick(active, context) {
      if (context.elapsed % 20 !== 0) {
        return;
      }
      const axis = normalizeVector(active.data.axis || { x: 1, y: 0, z: 0 });
      forEachLivingEntityInRadius(context.dimension, active.epicenter, config.effectRadius, (entity) => {
        applyDamageSafe(entity, config.damage);
        applyImpulseSafe(entity, { x: axis.x * 0.24, y: 0.2, z: axis.z * 0.24 });
      });
      if (config.mode === "tectonic" && context.elapsed % 40 === 0) {
        queueRidge(context.dimension, active.epicenter, axis, config.areaSize, active.data.offset || 2, config.material);
      }
    },
    finish() {},
  };
}

function buildSlideHandler(config) {
  return {
    start(active, context) {
      const slope = normalizeVector(active.data.slopeVector || { x: 0, y: 0, z: 0 });
      active.data.slideVector = Math.abs(slope.x) + Math.abs(slope.z) > 0
        ? slope
        : normalizeVector({ x: context.rng.sign(), y: 0, z: context.rng.sign() });
      active.data.slidePulse = 0;
      queueSlideLane(active, context.dimension, active.epicenter, active.data.slideVector, config.length, config.width, config.material);
    },
    tick(active, context) {
      if (context.elapsed % 20 !== 0) {
        return;
      }
      active.data.slidePulse = Number(active.data.slidePulse || 0) + 1;
      const laneCenter = addLocation(active.epicenter, scaleVector(active.data.slideVector, active.data.slidePulse * config.advancePerPulse));
      queueSlideLane(active, context.dimension, laneCenter, active.data.slideVector, config.length, config.width, config.material);
      forEachLivingEntityInRadius(context.dimension, laneCenter, config.effectRadius, (entity) => {
        applyDamageSafe(entity, config.damage);
        applyImpulseSafe(entity, {
          x: active.data.slideVector.x * config.pushStrength,
          y: 0.18,
          z: active.data.slideVector.z * config.pushStrength,
        });
      });
    },
    finish() {},
  };
}

function buildSpawnPressureHandler(config) {
  return {
    start(active, context) {
      active.data.lastSpawnTick = -1;
      active.data.spawnTicks = Array.isArray(config.spawnTicks) ? config.spawnTicks.slice() : [];
      if (!active.data.spawnTicks.length && config.spawnInterval) {
        for (let tick = config.spawnInterval; tick < config.durationTicks; tick += config.spawnInterval) {
          active.data.spawnTicks.push(tick);
        }
      }
      active.data.teleportSign = context.rng.sign();
    },
    tick(active, context) {
      forEachLivingEntityInRadius(context.dimension, active.epicenter, config.radius, (entity) => {
        if (config.playersOnly && entity.typeId !== "minecraft:player") {
          return;
        }
        if (config.effects) {
          for (const effect of config.effects) {
            applyEffectSafe(entity, effect.id, effect.durationTicks, effect.amplifier);
          }
        }
        if (config.damageInterval && context.elapsed % config.damageInterval === 0) {
          applyDamageSafe(entity, config.damageAmount);
        }
        if (config.fireInterval && context.elapsed % config.fireInterval === 0) {
          setOnFireSafe(entity, config.fireSeconds || 4);
        }
        if (config.teleportInterval && context.elapsed % config.teleportInterval === 0) {
          const offset = {
            x: context.rng.int(-config.teleportRadius, config.teleportRadius),
            y: 0,
            z: context.rng.int(-config.teleportRadius, config.teleportRadius),
          };
          const target = addLocation(active.epicenter, offset);
          const stand = findSurfaceStandingLocation(context.dimension, target.x, target.z, active.epicenter.y) || active.epicenter;
          teleportEntitySafe(entity, stand);
        }
        if (config.levitationInterval && context.elapsed % config.levitationInterval === 0) {
          applyEffectSafe(entity, "minecraft:levitation", 30, 0);
        }
        if (config.beeStingInterval && context.elapsed % config.beeStingInterval === 0 && entity.typeId === "minecraft:player") {
          applyDamageSafe(entity, 1);
          applyEffectSafe(entity, "minecraft:poison", 60, 0);
        }
      });

      if (config.hazardInterval && context.elapsed % config.hazardInterval === 0) {
        const hazardPoints = config.useCaves
          ? sampleCavePositions(context.dimension, active.epicenter, config.hazardRadius || 8, config.hazardCount || 4, context.rng)
          : sampleSurfacePositions(context.dimension, active.epicenter, config.hazardRadius || 8, config.hazardCount || 4, context.rng);
        for (const point of hazardPoints) {
          if (config.hazardBlockId === FIRE || config.hazardBlockId === SOUL_FIRE) {
            queueFireBlock(active, context.dimension, point, true, config.hazardBlockId);
          } else if (config.hazardBlockId && isAirLike(getBlockTypeId(context.dimension, point))) {
            enqueueTempBlock(active, context.dimension, point, config.hazardBlockId);
          }
          if (config.destroyCrops) {
            breakCropsAround(context.dimension, point);
          }
        }
      }

      const pendingSpawnTick = (active.data.spawnTicks || []).find((value) => value > active.data.lastSpawnTick && value <= context.elapsed);
      if (pendingSpawnTick === undefined) {
        return;
      }
      active.data.lastSpawnTick = pendingSpawnTick;
      const targetPlayers = getParticipantPlayersInRadius(context.dimension, active.epicenter, config.radius);
      const centers = targetPlayers.length
        ? targetPlayers.map((player) => floorLocation(player.location))
        : [active.epicenter];
      spawnConfiguredWave(active, context.dimension, centers, config, context.rng);
    },
    finish() {},
  };
}

function buildBlackPlagueHandler(config) {
  function markInfected(active, entity) {
    if (!entity?.id) {
      return;
    }
    const infected = getOrCreateExposureMap(active, "infected");
    infected[entity.id] = {
      lastSeen: floorLocation(entity.location),
      deadHandled: false,
    };
  }

  return {
    start(active, context) {
      forEachLivingEntityInRadius(context.dimension, active.epicenter, config.initialRadius, (entity) => {
        markInfected(active, entity);
      });
    },
    tick(active, context) {
      const infected = getOrCreateExposureMap(active, "infected");
      for (const entityId of Object.keys(infected)) {
        try {
          const entity = world.getEntity(entityId);
          if (!entity || entity.dimension.id !== context.dimension.id) {
            throw new Error("missing");
          }
          infected[entityId].lastSeen = floorLocation(entity.location);
          applyEffectSafe(entity, "minecraft:wither", 60, 0);
          applyEffectSafe(entity, "minecraft:weakness", 60, 1);
          if (context.elapsed % 40 === 0) {
            applyDamageSafe(entity, 1);
          }
        } catch {
          if (!infected[entityId].deadHandled && context.elapsed % config.spreadInterval === 0) {
            const lastSeen = infected[entityId].lastSeen;
            forEachLivingEntityInRadius(context.dimension, lastSeen, config.spreadRadius, (nearby) => {
              markInfected(active, nearby);
            });
            infected[entityId].deadHandled = true;
          }
        }
      }

      if (context.elapsed % config.spreadInterval !== 0) {
        return;
      }
      for (const entityId of Object.keys(infected)) {
        try {
          const entity = world.getEntity(entityId);
          if (!entity || entity.dimension.id !== context.dimension.id) {
            continue;
          }
          forEachLivingEntityInRadius(context.dimension, entity.location, config.spreadRadius, (nearby) => {
            markInfected(active, nearby);
          });
        } catch {
          // Ignore entities that are no longer loaded.
        }
      }
    },
    finish() {},
  };
}

function buildFloodHandler(config) {
  return {
    start(active, context) {
      const slope = normalizeVector(active.data.slopeVector || { x: 0, y: 0, z: 0 });
      active.data.waveVector = Math.abs(slope.x) + Math.abs(slope.z) > 0
        ? slope
        : normalizeVector({ x: context.rng.sign(), y: 0, z: context.rng.sign() });
      active.data.waveStep = 0;
    },
    tick(active, context) {
      if (context.elapsed % 20 !== 0) {
        return;
      }
      if (config.mode === "tsunami") {
        active.data.waveStep = Number(active.data.waveStep || 0) + 1;
        const direction = active.data.waveVector;
        const lateral = { x: -direction.z, y: 0, z: direction.x };
        const travel = scaleVector(direction, active.data.waveStep * config.forwardStep);
        for (let offset = -config.halfWidth; offset <= config.halfWidth; offset += config.lateralStep) {
          const base = addLocation(addLocation(active.epicenter, travel), scaleVector(lateral, offset));
          const stand = findSurfaceStandingLocation(context.dimension, floorNumber(base.x), floorNumber(base.z), active.epicenter.y) || floorLocation(base);
          for (let height = 0; height < config.wallHeight; height += 1) {
            enqueueTempBlock(active, context.dimension, { x: stand.x, y: stand.y + height, z: stand.z }, WATER);
          }
        }
        forEachLivingEntityInRadius(context.dimension, addLocation(active.epicenter, travel), config.pushRadius, (entity) => {
          applyImpulseSafe(entity, {
            x: direction.x * config.pushStrength,
            y: 0.18,
            z: direction.z * config.pushStrength,
          });
          applyDamageSafe(entity, 1);
        });
        return;
      }

      const floodPoints = sampleCavePositions(context.dimension, active.epicenter, config.radius, config.pointCount, context.rng);
      for (const point of floodPoints) {
        enqueueTempBlock(active, context.dimension, point, WATER);
      }
      forEachLivingEntityInRadius(context.dimension, active.epicenter, config.radius, (entity) => {
        applyImpulseSafe(entity, {
          x: active.data.waveVector.x * 0.16,
          y: 0.05,
          z: active.data.waveVector.z * 0.16,
        });
        if (context.elapsed % 40 === 0) {
          applyDamageSafe(entity, 1);
        }
      });
    },
    finish() {},
  };
}

function buildImpactStormHandler(config) {
  return {
    start(active, context) {
      active.data.lastImpactTick = -1;
      active.data.impactTicks = [];
      if (config.pulseInterval) {
        for (let tick = config.pulseInterval; tick < config.durationTicks; tick += config.pulseInterval) {
          active.data.impactTicks.push(tick);
        }
      } else {
        const count = context.rng.int(config.countMin, config.countMax);
        for (let index = 0; index < count; index += 1) {
          active.data.impactTicks.push(context.rng.int(10, Math.max(10, config.durationTicks - 10)));
        }
        active.data.impactTicks.sort((left, right) => left - right);
      }
    },
    tick(active, context) {
      const pendingTicks = (active.data.impactTicks || []).filter((value) => value > active.data.lastImpactTick && value <= context.elapsed);
      if (!pendingTicks.length) {
        return;
      }
      for (const tick of pendingTicks) {
        active.data.lastImpactTick = tick;
        const impactCount = config.impactsPerPulse
          ? context.rng.int(config.impactsPerPulse[0], config.impactsPerPulse[1])
          : 1;
        const impactPoints = sampleSurfacePositions(context.dimension, active.epicenter, config.radius, impactCount, context.rng);
        for (const point of impactPoints) {
          if (config.explosionPowerMin) {
            createExplosionSafe(context.dimension, point, context.rng.int(config.explosionPowerMin, config.explosionPowerMax), !!config.causesFire);
          }
          if (config.lightning) {
            summonLightning(context.dimension, point);
          }
          if (config.directDamage) {
            forEachLivingEntityInRadius(context.dimension, point, config.damageRadius || 4, (entity) => {
              if (!config.exposedOnly || isExposedToSky(context.dimension, entity.location)) {
                applyDamageSafe(entity, config.directDamage);
              }
            });
          }
          if (config.breakGlass) {
            breakGlassAround(context.dimension, point);
          }
          if (config.destroyCrops) {
            breakCropsAround(context.dimension, point);
          }
          if (config.fireCount) {
            const firePoints = sampleSurfacePositions(context.dimension, point, 3, config.fireCount, context.rng);
            for (const firePoint of firePoints) {
              queueFireBlock(active, context.dimension, firePoint, !!config.tempFire, config.fireBlockId || FIRE);
            }
          }
        }
      }
    },
    finish() {},
  };
}

function buildEruptionHandler(config) {
  return {
    start(active, context) {
      active.data.lastPulseTick = -1;
      if (config.mode === "supernova") {
        active.data.waveTicks = config.waveTicks.slice();
      }
      if (config.mode === "supernova") {
        queueMessage("[Disasters] A supernova flare is building overhead.");
      }
    },
    tick(active, context) {
      if (config.mode === "supernova") {
        const pendingWave = (active.data.waveTicks || []).find((value) => value > active.data.lastPulseTick && value <= context.elapsed);
        if (pendingWave === undefined) {
          return;
        }
        active.data.lastPulseTick = pendingWave;
        const waveIndex = config.waveTicks.indexOf(pendingWave);
        const waveRadius = config.waveRadii[Math.max(0, waveIndex)];
        createExplosionSafe(context.dimension, active.epicenter, 5 + waveIndex, true);
        queueSparseCrater(context.dimension, active.epicenter, waveRadius, 5 + waveIndex * 2, 18 + waveIndex * 8, context.rng, false);
        forEachLivingEntityInRadius(context.dimension, active.epicenter, waveRadius, (entity) => {
          applyDamageSafe(entity, 4 + waveIndex * 2);
          setOnFireSafe(entity, 6);
        });
        const firePoints = sampleSurfacePositions(context.dimension, active.epicenter, Math.max(8, Math.floor(waveRadius / 2)), 10 + waveIndex * 4, context.rng);
        for (const firePoint of firePoints) {
          queueFireBlock(active, context.dimension, firePoint, false, FIRE);
        }
        return;
      }

      if (context.elapsed % config.pulseInterval !== 0) {
        return;
      }
      const blastPoints = sampleSurfacePositions(context.dimension, active.epicenter, config.radius, config.blastCount, context.rng);
      for (const point of blastPoints) {
        createExplosionSafe(context.dimension, point, context.rng.int(config.explosionPowerMin, config.explosionPowerMax), true);
        if (config.placeLava) {
          enqueueBlockChange(context.dimension.id, point, LAVA);
        }
        const firePoints = sampleSurfacePositions(context.dimension, point, 3, 4, context.rng);
        for (const firePoint of firePoints) {
          queueFireBlock(active, context.dimension, firePoint, false, FIRE);
        }
      }
      forEachLivingEntityInRadius(context.dimension, active.epicenter, config.radius, (entity) => {
        applyDamageSafe(entity, 2);
        setOnFireSafe(entity, 4);
      });
    },
    finish() {},
  };
}

function buildWildfireHandler(config) {
  return {
    start(active, context) {
      active.data.fronts = sampleSurfacePositions(context.dimension, active.epicenter, 8, 8, context.rng);
    },
    tick(active, context) {
      if (context.elapsed % 20 !== 0) {
        return;
      }
      const nextFronts = [];
      for (const front of active.data.fronts || []) {
        const spreadPoints = sampleSurfacePositions(context.dimension, front, config.spreadRadius, config.spreadCount, context.rng);
        for (const point of spreadPoints) {
          const feetType = getBlockTypeId(context.dimension, point);
          const floorType = getBlockTypeId(context.dimension, { x: point.x, y: point.y - 1, z: point.z });
          if (
            isFlammable(feetType) ||
            isFlammable(floorType) ||
            feetType.includes("leaves") ||
            floorType.includes("log") ||
            floorType === GRASS_BLOCK ||
            floorType === DIRT
          ) {
            queueFireBlock(active, context.dimension, point, false, FIRE);
            nextFronts.push(point);
          }
        }
      }
      active.data.fronts = nextFronts.slice(0, config.maxFronts);
      forEachLivingEntityInRadius(context.dimension, active.epicenter, config.radius, (entity) => {
        if (context.elapsed % 40 === 0) {
          setOnFireSafe(entity, 4);
        }
      });
    },
    finish() {},
  };
}

const ALL_DIMENSION_IDS = Object.freeze(Object.values(DIMENSION_IDS));

function makeSiteConfig(overrides) {
  return Object.freeze({
    dimensionIds: [DIMENSION_IDS.overworld],
    strategy: "surface",
    selectAttempts: 14,
    ...overrides,
  });
}

function buildDefaultCanAnchor(siteConfig, options = {}) {
  return (anchor) => {
    if (!anchor || !isParticipant(anchor)) {
      return false;
    }
    if (!siteConfig.dimensionIds.includes(anchor.dimension.id)) {
      return false;
    }
    if (options.timeAny?.length && !options.timeAny.includes(getTimePhase())) {
      return false;
    }
    if (options.weatherAny?.length && !options.weatherAny.includes(getWeatherTag(anchor.dimension))) {
      return false;
    }
    if (options.customCheck && !options.customCheck(anchor)) {
      return false;
    }
    return matchesRequirementAt(anchor.dimension, floorLocation(anchor.location), siteConfig);
  };
}

function buildDefaultSelectEpicenter(siteConfig) {
  return (anchor, context = {}) => {
    const rng = context.rng || createRng(hashString(`${anchor?.id || anchor?.name || "anchor"}:${currentTick()}`));
    return selectEpicenterForConfig(siteConfig, anchor, rng)?.location;
  };
}

function createDisasterDefinition(spec) {
  const handler = spec.builder(spec.handlerConfig);
  return Object.freeze({
    id: spec.id,
    label: spec.label,
    tier: spec.tier,
    fxProfile: spec.fxProfile || DISASTER_FX_PROFILE_MAP[spec.id] || "earth",
    durationTicks: spec.durationTicks,
    blockBudget: spec.blockBudget ?? BLOCK_QUEUE_PER_EVENT,
    mobBudget: spec.mobBudget ?? DEFAULT_MOB_BUDGET,
    canAnchor: spec.canAnchor || buildDefaultCanAnchor(spec.siteConfig, spec.anchorRules),
    selectEpicenter: spec.selectEpicenter || buildDefaultSelectEpicenter(spec.siteConfig),
    start: handler.start,
    tick: handler.tick,
    finish: handler.finish,
  });
}

const OVERWORLD_SURFACE_SITE = makeSiteConfig({
  dimensionIds: [DIMENSION_IDS.overworld],
  strategy: "surface",
  requiresOpenSky: true,
  terrainAny: ["surface"],
});

const OVERWORLD_CAVE_SITE = makeSiteConfig({
  dimensionIds: [DIMENSION_IDS.overworld],
  strategy: "cave",
  requiresUnderground: true,
});

const OVERWORLD_COAST_SITE = makeSiteConfig({
  dimensionIds: [DIMENSION_IDS.overworld],
  strategy: "surface",
  requiresOpenSky: true,
  terrainAny: ["coast", "ocean"],
  nearWater: true,
  nearSeaLevel: true,
});

const OVERWORLD_DESERT_SITE = makeSiteConfig({
  dimensionIds: [DIMENSION_IDS.overworld],
  strategy: "surface",
  requiresOpenSky: true,
  terrainAny: ["desert", "badlands"],
});

const OVERWORLD_SNOW_SITE = makeSiteConfig({
  dimensionIds: [DIMENSION_IDS.overworld],
  strategy: "surface",
  requiresOpenSky: true,
  terrainAny: ["snowy", "frozen"],
});

const OVERWORLD_FOREST_SITE = makeSiteConfig({
  dimensionIds: [DIMENSION_IDS.overworld],
  strategy: "surface",
  requiresOpenSky: true,
  terrainAny: ["forest", "plains", "flower"],
});

const OVERWORLD_SWAMP_SITE = makeSiteConfig({
  dimensionIds: [DIMENSION_IDS.overworld],
  strategy: "surface",
  requiresOpenSky: true,
  terrainAny: ["swamp"],
  nearWater: true,
});

const OVERWORLD_MOUNTAIN_SITE = makeSiteConfig({
  dimensionIds: [DIMENSION_IDS.overworld],
  strategy: "surface",
  requiresOpenSky: true,
  terrainAny: ["mountain", "slope", "snowy"],
  minY: 90,
});

const OVERWORLD_ROCKY_MOUNTAIN_SITE = makeSiteConfig({
  dimensionIds: [DIMENSION_IDS.overworld],
  strategy: "surface",
  requiresOpenSky: true,
  terrainAny: ["mountain", "rocky"],
  minY: 100,
});

const NETHER_SITE = makeSiteConfig({
  dimensionIds: [DIMENSION_IDS.nether],
  strategy: "surface_or_cave",
  terrainAny: ["nether"],
});

const END_SITE = makeSiteConfig({
  dimensionIds: [DIMENSION_IDS.end],
  strategy: "surface",
  terrainAny: ["end"],
});

const ALL_SURFACE_SITE = makeSiteConfig({
  dimensionIds: [DIMENSION_IDS.overworld, DIMENSION_IDS.end],
  strategy: "surface",
  requiresOpenSky: true,
});

const DISASTER_SPECS = [
  {
    id: "sinkhole",
    label: "Sinkhole",
    tier: "common",
    durationTicks: 8 * TICKS_PER_SECOND,
    builder: buildSinkholeHandler,
    handlerConfig: { depthMin: 6, depthMax: 10 },
    siteConfig: makeSiteConfig({ ...OVERWORLD_SURFACE_SITE, avoidWaterSurface: true }),
  },
  {
    id: "earthquake",
    label: "Earthquake",
    tier: "common",
    durationTicks: 20 * TICKS_PER_SECOND,
    builder: buildEarthquakeHandler,
    handlerConfig: { radius: 24 },
    siteConfig: OVERWORLD_SURFACE_SITE,
    anchorRules: {
      customCheck(anchor) {
        return !isLiquid(getBlockTypeId(anchor.dimension, floorLocation(anchor.location)));
      },
    },
  },
  {
    id: "tornado",
    label: "Tornado",
    tier: "uncommon",
    durationTicks: 30 * TICKS_PER_SECOND,
    builder: buildTornadoHandler,
    handlerConfig: { radius: 18 },
    siteConfig: OVERWORLD_FOREST_SITE,
  },
  {
    id: "cave_in",
    label: "Cave In",
    tier: "common",
    durationTicks: 15 * TICKS_PER_SECOND,
    builder: buildCaveInHandler,
    handlerConfig: { radius: 12 },
    siteConfig: OVERWORLD_CAVE_SITE,
  },
  {
    id: "water_geyser",
    label: "Water Geyser",
    tier: "common",
    durationTicks: 10 * TICKS_PER_SECOND,
    builder: buildGeyserHandler,
    handlerConfig: {
      blockId: WATER,
      burstTicks: [20, 80, 140],
      columnHeight: 6,
      radius: 3,
      verticalImpulse: 1.2,
    },
    siteConfig: makeSiteConfig({
      dimensionIds: [DIMENSION_IDS.overworld],
      strategy: "surface",
      requiresOpenSky: true,
      nearWater: true,
    }),
  },
  {
    id: "lava_geyser",
    label: "Lava Geyser",
    tier: "uncommon",
    durationTicks: 12 * TICKS_PER_SECOND,
    builder: buildGeyserHandler,
    handlerConfig: {
      blockId: LAVA,
      burstTicks: [20, 100, 180],
      columnHeight: 5,
      radius: 3,
      verticalImpulse: 1,
      fireSeconds: 6,
    },
    siteConfig: makeSiteConfig({
      dimensionIds: [DIMENSION_IDS.overworld, DIMENSION_IDS.nether],
      strategy: "surface_or_cave",
      terrainAny: ["rocky", "nether"],
    }),
  },
  {
    id: "acid_rain",
    label: "Acid Rain",
    tier: "uncommon",
    durationTicks: 45 * TICKS_PER_SECOND,
    builder: buildStatusStormHandler,
    handlerConfig: {
      id: "acid_rain",
      radius: 32,
      exposedOnly: true,
      effects: [{ id: "minecraft:weakness", durationTicks: 60, amplifier: 0 }],
      damageInterval: 40,
      damageAmount: 1,
      worldPulseInterval: 40,
      worldPulseCount: 8,
      destroyCrops: true,
      corrodeBlocks: true,
      generatePools: 10,
      poolDamage: 1,
      inventoryWarning: METAL_ITEM_IDS,
      inventoryWarningMessage: "[Disasters] Acid rain is corroding exposed metal gear.",
    },
    siteConfig: OVERWORLD_SURFACE_SITE,
    anchorRules: { weatherAny: ["rain", "thunder"] },
  },
  {
    id: "extreme_winds",
    label: "Extreme Winds",
    tier: "common",
    durationTicks: 20 * TICKS_PER_SECOND,
    builder: buildStatusStormHandler,
    handlerConfig: {
      id: "extreme_winds",
      radius: 24,
      knockbackInterval: 20,
      knockbackMode: "directional",
      knockbackStrength: 0.28,
      knockbackVertical: 0.08,
    },
    siteConfig: OVERWORLD_SURFACE_SITE,
  },
  {
    id: "soul_storm",
    label: "Soul Storm",
    tier: "uncommon",
    durationTicks: 35 * TICKS_PER_SECOND,
    builder: buildSpawnPressureHandler,
    handlerConfig: {
      durationTicks: 35 * TICKS_PER_SECOND,
      radius: 24,
      spawnTicks: [20, 140, 280, 420, 560],
      spawnTypes: ["minecraft:wither_skeleton", "minecraft:ghast"],
      spawnCountPerCenter: 1,
      spawnRadius: 12,
      hazardInterval: 40,
      hazardCount: 6,
      hazardRadius: 10,
      hazardBlockId: SOUL_FIRE,
      effects: [
        { id: "minecraft:slowness", durationTicks: 60, amplifier: 1 },
        { id: "minecraft:weakness", durationTicks: 60, amplifier: 0 },
      ],
      damageInterval: 60,
      damageAmount: 1,
    },
    siteConfig: NETHER_SITE,
  },
  {
    id: "blizzard",
    label: "Blizzard",
    tier: "uncommon",
    durationTicks: 45 * TICKS_PER_SECOND,
    builder: buildStatusStormHandler,
    handlerConfig: {
      id: "blizzard",
      radius: 32,
      exposedOnly: true,
      effects: [{ id: "minecraft:slowness", durationTicks: 60, amplifier: 1 }],
      damageInterval: 60,
      damageAmount: 1,
      worldPulseInterval: 40,
      worldPulseCount: 8,
      freezeWater: true,
      tempBlockId: SNOW,
      encaseAfterExposure: 20 * TICKS_PER_SECOND,
    },
    siteConfig: OVERWORLD_SNOW_SITE,
  },
  {
    id: "sandstorm",
    label: "Sandstorm",
    tier: "uncommon",
    durationTicks: 40 * TICKS_PER_SECOND,
    builder: buildStatusStormHandler,
    handlerConfig: {
      id: "sandstorm",
      radius: 32,
      exposedOnly: true,
      effects: [{ id: "minecraft:blindness", durationTicks: 60, amplifier: 0 }],
      damageInterval: 60,
      damageAmount: 1,
      knockbackInterval: 20,
      knockbackMode: "directional",
      knockbackStrength: 0.14,
      knockbackVertical: 0.03,
      worldPulseInterval: 40,
      worldPulseCount: 7,
      tempBlockId: SAND,
    },
    siteConfig: OVERWORLD_DESERT_SITE,
  },
  {
    id: "black_plague",
    label: "Black Plague",
    tier: "rare",
    durationTicks: 90 * TICKS_PER_SECOND,
    builder: buildBlackPlagueHandler,
    handlerConfig: {
      initialRadius: 8,
      spreadRadius: 8,
      spreadInterval: 60,
    },
    siteConfig: makeSiteConfig({
      dimensionIds: ALL_DIMENSION_IDS,
      strategy: "surface_or_cave",
      selectAttempts: 10,
    }),
    anchorRules: {
      customCheck(anchor) {
        return countLivingEntitiesInRadius(anchor.dimension, anchor.location, 16) >= 5;
      },
    },
  },
  {
    id: "tsunami",
    label: "Tsunami",
    tier: "rare",
    durationTicks: 30 * TICKS_PER_SECOND,
    builder: buildFloodHandler,
    handlerConfig: {
      mode: "tsunami",
      halfWidth: 16,
      lateralStep: 4,
      wallHeight: 3,
      forwardStep: 2,
      pushRadius: 12,
      pushStrength: 0.45,
    },
    siteConfig: OVERWORLD_COAST_SITE,
  },
  {
    id: "meteor_shower",
    label: "Meteor Shower",
    tier: "uncommon",
    durationTicks: 25 * TICKS_PER_SECOND,
    builder: buildImpactStormHandler,
    handlerConfig: {
      durationTicks: 25 * TICKS_PER_SECOND,
      radius: 32,
      countMin: 6,
      countMax: 10,
      explosionPowerMin: 2,
      explosionPowerMax: 4,
      causesFire: true,
      directDamage: 4,
      damageRadius: 5,
      fireCount: 2,
    },
    siteConfig: OVERWORLD_SURFACE_SITE,
  },
  {
    id: "end_storm",
    label: "End Storm",
    tier: "uncommon",
    durationTicks: 35 * TICKS_PER_SECOND,
    builder: buildSpawnPressureHandler,
    handlerConfig: {
      durationTicks: 35 * TICKS_PER_SECOND,
      radius: 28,
      spawnTicks: [20, 160, 300, 440, 580],
      spawnTypes: ["minecraft:enderman", "minecraft:endermite", "minecraft:shulker"],
      spawnCountPerCenter: 1,
      spawnRadius: 10,
      teleportInterval: 80,
      teleportRadius: 8,
      levitationInterval: 60,
    },
    siteConfig: END_SITE,
  },
  {
    id: "supernova",
    label: "Supernova",
    tier: "apocalyptic",
    durationTicks: 20 * TICKS_PER_SECOND,
    builder: buildEruptionHandler,
    handlerConfig: {
      mode: "supernova",
      waveTicks: [5 * TICKS_PER_SECOND, 10 * TICKS_PER_SECOND, 15 * TICKS_PER_SECOND],
      waveRadii: [16, 32, 48],
    },
    siteConfig: OVERWORLD_SURFACE_SITE,
  },
  {
    id: "hurricane",
    label: "Hurricane",
    tier: "rare",
    durationTicks: 60 * TICKS_PER_SECOND,
    builder: buildStatusStormHandler,
    handlerConfig: {
      id: "hurricane",
      radius: 40,
      exposedOnly: true,
      knockbackInterval: 20,
      knockbackMode: "swirl",
      knockbackStrength: 0.26,
      knockbackVertical: 0.12,
      worldPulseInterval: 30,
      worldPulseCount: 10,
      lightningPulse: true,
      floodPulse: true,
    },
    siteConfig: OVERWORLD_COAST_SITE,
    anchorRules: { weatherAny: ["rain", "thunder"] },
  },
  {
    id: "purge",
    label: "Purge",
    tier: "uncommon",
    durationTicks: 45 * TICKS_PER_SECOND,
    builder: buildSpawnPressureHandler,
    handlerConfig: {
      durationTicks: 45 * TICKS_PER_SECOND,
      radius: 32,
      spawnTicks: [20, 300, 580],
      spawnTypes: ["minecraft:zombie", "minecraft:skeleton", "minecraft:spider", "minecraft:husk"],
      spawnCountPerCenter: 2,
      spawnRadius: 10,
      spawnEffect: { id: "minecraft:speed", durationTicks: 200, amplifier: 1 },
    },
    siteConfig: makeSiteConfig({
      dimensionIds: [DIMENSION_IDS.overworld],
      strategy: "near_anchor",
      requiresOpenSky: true,
    }),
    anchorRules: { timeAny: ["night"] },
  },
  {
    id: "solar_storm",
    label: "Solar Storm",
    tier: "uncommon",
    durationTicks: 30 * TICKS_PER_SECOND,
    builder: buildStatusStormHandler,
    handlerConfig: {
      id: "solar_storm",
      radius: 32,
      exposedOnly: true,
      damageInterval: 40,
      damageAmount: 1,
      fireExposureInterval: 40,
      fireSeconds: 4,
      worldPulseInterval: 30,
      worldPulseCount: 8,
      firePulse: true,
    },
    siteConfig: OVERWORLD_SURFACE_SITE,
    anchorRules: { timeAny: ["day"], weatherAny: ["clear"] },
  },
  {
    id: "monsoon",
    label: "Monsoon",
    tier: "uncommon",
    durationTicks: 60 * TICKS_PER_SECOND,
    builder: buildStatusStormHandler,
    handlerConfig: {
      id: "monsoon",
      radius: 32,
      exposedOnly: true,
      effects: [{ id: "minecraft:slowness", durationTicks: 60, amplifier: 1 }],
      worldPulseInterval: 30,
      worldPulseCount: 10,
      floodPulse: true,
    },
    siteConfig: makeSiteConfig({
      dimensionIds: [DIMENSION_IDS.overworld],
      strategy: "surface",
      requiresOpenSky: true,
      terrainAny: ["swamp", "plains", "forest"],
    }),
    anchorRules: { weatherAny: ["rain", "thunder"] },
  },
  {
    id: "infested_caves",
    label: "Infested Caves",
    tier: "common",
    durationTicks: 45 * TICKS_PER_SECOND,
    builder: buildSpawnPressureHandler,
    handlerConfig: {
      durationTicks: 45 * TICKS_PER_SECOND,
      radius: 20,
      spawnInterval: 80,
      spawnTypes: ["minecraft:zombie", "minecraft:spider", "minecraft:silverfish"],
      spawnCountPerCenter: 2,
      spawnRadius: 8,
      useCaves: true,
      hazardInterval: 80,
      hazardCount: 6,
      hazardRadius: 8,
      hazardBlockId: COBWEB,
      destroyCrops: false,
    },
    siteConfig: makeSiteConfig({
      dimensionIds: [DIMENSION_IDS.overworld],
      strategy: "cave",
      requiresUnderground: true,
      maxY: 55,
    }),
  },
  {
    id: "landslide_avalanche",
    label: "Landslide / Avalanche",
    tier: "uncommon",
    durationTicks: 15 * TICKS_PER_SECOND,
    builder: buildSlideHandler,
    handlerConfig: {
      length: 20,
      width: 10,
      material: SNOW_BLOCK,
      advancePerPulse: 2,
      effectRadius: 12,
      damage: 2,
      pushStrength: 0.22,
    },
    siteConfig: OVERWORLD_MOUNTAIN_SITE,
  },
  {
    id: "volcanic_eruption",
    label: "Volcanic Eruption",
    tier: "rare",
    durationTicks: 40 * TICKS_PER_SECOND,
    builder: buildEruptionHandler,
    handlerConfig: {
      mode: "volcano",
      pulseInterval: 40,
      radius: 20,
      blastCount: 4,
      explosionPowerMin: 2,
      explosionPowerMax: 3,
      placeLava: true,
    },
    siteConfig: OVERWORLD_ROCKY_MOUNTAIN_SITE,
  },
  {
    id: "fissure",
    label: "Fissure",
    tier: "uncommon",
    durationTicks: 18 * TICKS_PER_SECOND,
    builder: buildTerrainSplitHandler,
    handlerConfig: {
      mode: "fissure",
      length: 24,
      width: 3,
      depthMin: 6,
      depthMax: 8,
      lavaBottomChance: 0.35,
      effectRadius: 8,
      damage: 2,
    },
    siteConfig: OVERWORLD_SURFACE_SITE,
  },
  {
    id: "tectonic_shift",
    label: "Tectonic Shift",
    tier: "rare",
    durationTicks: 25 * TICKS_PER_SECOND,
    builder: buildTerrainSplitHandler,
    handlerConfig: {
      mode: "tectonic",
      areaSize: 20,
      offsetMin: 2,
      offsetMax: 4,
      material: COBBLESTONE,
      effectRadius: 10,
      damage: 2,
    },
    siteConfig: OVERWORLD_SURFACE_SITE,
  },
  {
    id: "rock_slide",
    label: "Rock Slide",
    tier: "common",
    durationTicks: 10 * TICKS_PER_SECOND,
    builder: buildSlideHandler,
    handlerConfig: {
      length: 12,
      width: 8,
      material: GRAVEL,
      advancePerPulse: 2,
      effectRadius: 10,
      damage: 2,
      pushStrength: 0.24,
    },
    siteConfig: makeSiteConfig({
      dimensionIds: [DIMENSION_IDS.overworld],
      strategy: "surface_or_cave",
      terrainAny: ["rocky", "slope"],
    }),
  },
  {
    id: "underground_flooding",
    label: "Underground Flooding",
    tier: "uncommon",
    durationTicks: 20 * TICKS_PER_SECOND,
    builder: buildFloodHandler,
    handlerConfig: {
      mode: "underground",
      radius: 16,
      pointCount: 6,
    },
    siteConfig: makeSiteConfig({
      dimensionIds: [DIMENSION_IDS.overworld],
      strategy: "cave",
      requiresUnderground: true,
      nearWater: true,
    }),
  },
  {
    id: "electromagnetic_storm",
    label: "Electromagnetic Storm",
    tier: "rare",
    durationTicks: 30 * TICKS_PER_SECOND,
    builder: buildStatusStormHandler,
    handlerConfig: {
      id: "electromagnetic_storm",
      radius: 32,
      exposedOnly: true,
      worldPulseInterval: 40,
      worldPulseCount: 6,
      lightningPulse: true,
      techPulseInterval: 40,
      inventoryWarning: DISASTER_SENSITIVE_ITEMS,
      inventoryWarningMessage: "[Disasters] Electronics and navigational tools are being jammed.",
    },
    siteConfig: OVERWORLD_SURFACE_SITE,
    canAnchor(anchor) {
      return buildDefaultCanAnchor(OVERWORLD_SURFACE_SITE, {
        customCheck(candidateAnchor) {
          const weather = getWeatherTag(candidateAnchor.dimension);
          return weather === "thunder" || getTimePhase() === "night";
        },
      })(anchor);
    },
  },
  {
    id: "hail_storm",
    label: "Hail Storm",
    tier: "uncommon",
    durationTicks: 30 * TICKS_PER_SECOND,
    builder: buildImpactStormHandler,
    handlerConfig: {
      durationTicks: 30 * TICKS_PER_SECOND,
      radius: 24,
      pulseInterval: 10,
      impactsPerPulse: [1, 2],
      directDamage: 1,
      damageRadius: 3,
      exposedOnly: true,
      breakGlass: true,
      destroyCrops: true,
    },
    siteConfig: makeSiteConfig({
      dimensionIds: [DIMENSION_IDS.overworld],
      strategy: "surface",
      requiresOpenSky: true,
      terrainAny: ["plains", "snowy", "frozen"],
    }),
    anchorRules: { weatherAny: ["rain", "thunder"] },
  },
  {
    id: "super_fog",
    label: "Super Fog",
    tier: "common",
    durationTicks: 40 * TICKS_PER_SECOND,
    builder: buildStatusStormHandler,
    handlerConfig: {
      id: "super_fog",
      radius: 32,
      effects: [{ id: "minecraft:blindness", durationTicks: 60, amplifier: 0 }],
    },
    siteConfig: ALL_SURFACE_SITE,
  },
  {
    id: "swarming_bees",
    label: "Swarming Bees",
    tier: "common",
    durationTicks: 25 * TICKS_PER_SECOND,
    builder: buildSpawnPressureHandler,
    handlerConfig: {
      durationTicks: 25 * TICKS_PER_SECOND,
      radius: 24,
      spawnTicks: [20, 160, 300, 440],
      spawnTypes: ["minecraft:bee"],
      spawnCountPerCenter: 2,
      spawnRadius: 6,
      beeStingInterval: 40,
      hazardInterval: 60,
      hazardCount: 6,
      hazardRadius: 8,
      destroyCrops: true,
    },
    siteConfig: makeSiteConfig({
      dimensionIds: [DIMENSION_IDS.overworld],
      strategy: "near_anchor",
      requiresOpenSky: true,
      terrainAny: ["forest", "plains", "flower"],
    }),
    anchorRules: { timeAny: ["day"] },
  },
  {
    id: "wildfire",
    label: "Wildfire",
    tier: "uncommon",
    durationTicks: 45 * TICKS_PER_SECOND,
    builder: buildWildfireHandler,
    handlerConfig: {
      radius: 24,
      spreadRadius: 4,
      spreadCount: 3,
      maxFronts: 12,
    },
    siteConfig: OVERWORLD_FOREST_SITE,
    anchorRules: { weatherAny: ["clear"] },
  },
  {
    id: "frostbite_winds",
    label: "Frostbite Winds",
    tier: "uncommon",
    durationTicks: 30 * TICKS_PER_SECOND,
    builder: buildStatusStormHandler,
    handlerConfig: {
      id: "frostbite_winds",
      radius: 24,
      exposedOnly: true,
      effects: [{ id: "minecraft:slowness", durationTicks: 60, amplifier: 1 }],
      damageInterval: 60,
      damageAmount: 1,
      worldPulseInterval: 40,
      worldPulseCount: 6,
      tempBlockId: SNOW,
    },
    siteConfig: OVERWORLD_SNOW_SITE,
  },
  {
    id: "shifting_sand_dunes",
    label: "Shifting Sand Dunes",
    tier: "rare",
    durationTicks: 30 * TICKS_PER_SECOND,
    builder: buildSlideHandler,
    handlerConfig: {
      length: 24,
      width: 12,
      material: SAND,
      advancePerPulse: 1,
      effectRadius: 18,
      damage: 1,
      pushStrength: 0.18,
    },
    siteConfig: OVERWORLD_DESERT_SITE,
  },
  {
    id: "acidic_swamps",
    label: "Acidic Swamps",
    tier: "uncommon",
    durationTicks: 45 * TICKS_PER_SECOND,
    builder: buildStatusStormHandler,
    handlerConfig: {
      id: "acidic_swamps",
      radius: 20,
      effects: [{ id: "minecraft:nausea", durationTicks: 60, amplifier: 0 }],
      damageInterval: 40,
      damageAmount: 1,
      worldPulseInterval: 40,
      worldPulseCount: 6,
      generatePools: 10,
      poolDamage: 1,
      corrodeBlocks: true,
      floodPulse: true,
    },
    siteConfig: OVERWORLD_SWAMP_SITE,
  },
  {
    id: "lightning_wildfire",
    label: "Lightning Wildfire",
    tier: "uncommon",
    durationTicks: 35 * TICKS_PER_SECOND,
    builder: buildImpactStormHandler,
    handlerConfig: {
      durationTicks: 35 * TICKS_PER_SECOND,
      radius: 32,
      countMin: 8,
      countMax: 12,
      lightning: true,
      fireCount: 3,
      fireBlockId: FIRE,
    },
    siteConfig: OVERWORLD_FOREST_SITE,
    anchorRules: { weatherAny: ["thunder"] },
  },
];

export const DISASTER_DEFINITIONS = Object.freeze(DISASTER_SPECS.map(createDisasterDefinition));

const DISASTER_DEFINITION_MAP = new Map(DISASTER_DEFINITIONS.map((definition) => [definition.id, definition]));

function getDefaultDisasterConfig() {
  const enabledDisasters = {};
  for (const definition of DISASTER_DEFINITIONS) {
    enabledDisasters[definition.id] = true;
  }
  return {
    difficulty: "mid",
    autoSchedule: true,
    enabledDisasters,
  };
}

function normalizeDisasterConfig(value) {
  const defaults = getDefaultDisasterConfig();
  const enabledDisasters = { ...defaults.enabledDisasters };
  if (value?.enabledDisasters && typeof value.enabledDisasters === "object") {
    for (const definition of DISASTER_DEFINITIONS) {
      if (Object.prototype.hasOwnProperty.call(value.enabledDisasters, definition.id)) {
        enabledDisasters[definition.id] = value.enabledDisasters[definition.id] !== false;
      }
    }
  }
  return {
    difficulty: normalizeDifficulty(value?.difficulty),
    autoSchedule: value?.autoSchedule !== false,
    enabledDisasters,
  };
}

function getRuntimeConfig() {
  if (!runtimeState.config) {
    runtimeState.config = getDefaultDisasterConfig();
  }
  return runtimeState.config;
}

function applyDisasterConfig(nextConfig) {
  runtimeState.config = normalizeDisasterConfig(nextConfig);
  if (!runtimeState.config.autoSchedule || !getEnabledDisasterCount() || runtimeState.active) {
    runtimeState.cooldownUntilTick = 0;
  } else {
    runtimeState.cooldownUntilTick = 0;
    scheduleNextRandomDisaster({ persist: false });
  }
  persistActiveState();
  return runtimeState.config;
}

function getEnabledDisasterCount() {
  const config = getRuntimeConfig();
  return DISASTER_DEFINITIONS.reduce((count, definition) => {
    return count + (config.enabledDisasters[definition.id] !== false ? 1 : 0);
  }, 0);
}

function isDisasterEnabledForAuto(disasterId) {
  const config = getRuntimeConfig();
  const normalizedId = normalizeDisasterId(disasterId);
  return config.enabledDisasters[normalizedId] !== false;
}

function getNextDisasterDelayTicks() {
  const difficulty = getRuntimeConfig().difficulty;
  const settings = getDifficultySettings(difficulty);
  const seed = hashString(`schedule:${getCurrentTick()}:${difficulty}:${runtimeState.recentHistory.join(",")}`);
  return createRng(seed).int(settings.minDelayTicks, settings.maxDelayTicks);
}

function clearNextScheduledDisaster(persist = true) {
  runtimeState.cooldownUntilTick = 0;
  if (persist) {
    persistActiveState();
  }
}

function scheduleNextRandomDisaster(options = {}) {
  const config = getRuntimeConfig();
  if (!config.autoSchedule || !getEnabledDisasterCount() || runtimeState.active) {
    runtimeState.cooldownUntilTick = 0;
  } else {
    const baseTick = Number(options.fromTick ?? getCurrentTick()) || getCurrentTick();
    const delayTicks = options.retry ? SCHEDULE_RETRY_TICKS : getNextDisasterDelayTicks();
    runtimeState.cooldownUntilTick = baseTick + delayTicks;
  }
  if (options.persist !== false) {
    persistActiveState();
  }
  return runtimeState.cooldownUntilTick;
}

function ensureScheduledDisasterTick() {
  const config = getRuntimeConfig();
  if (!config.autoSchedule || !getEnabledDisasterCount() || runtimeState.active) {
    runtimeState.cooldownUntilTick = 0;
    return;
  }
  if (!runtimeState.cooldownUntilTick) {
    scheduleNextRandomDisaster({ persist: false });
  }
}

function getCurrentTick() {
  return currentTick();
}

function getDisasterDefinition(disasterId) {
  return DISASTER_DEFINITION_MAP.get(normalizeDisasterId(disasterId));
}

function buildDisasterContext(active, definition) {
  const tick = getCurrentTick();
  const elapsed = Math.max(0, tick - Number(active?.startedTick || tick));
  return {
    active,
    definition,
    dimension: getDimensionSafe(active?.dimensionId),
    currentTick: tick,
    elapsed,
    remaining: Math.max(0, Number(active?.endTick || tick) - tick),
    rng: createRng(hashString(`${active?.seed || 0}:${elapsed}:${active?.disasterId || "disaster"}`)),
    participants: getParticipantPlayers(),
  };
}

function emitActiveDisasterFx(active, context) {
  const profileId = context.definition?.fxProfile || DISASTER_FX_PROFILE_MAP[active?.disasterId] || "earth";
  const profile = DISASTER_FX_PROFILES[profileId];
  if (!profile || !context.dimension) {
    return;
  }

  if (profile.particleInterval && context.elapsed % profile.particleInterval === 0) {
    const points = sampleFxPoints(
      active.epicenter,
      profile.particleSpread || 4,
      profile.particleCount || 4,
      profile.particleHeight || 2,
      context.rng
    );
    for (const point of points) {
      spawnParticleSafe(context.dimension, context.rng.pick(profile.particleIds || []), point);
    }
  }

  if (profile.soundInterval && context.elapsed % profile.soundInterval === 0) {
    const soundId = context.rng.pick(profile.soundIds || []);
    if (soundId) {
      playSoundSafe(context.dimension, soundId, addLocation(active.epicenter, { x: 0, y: 1, z: 0 }), {
        volume: profile.volume ?? 1,
        pitch: profile.pitchMin !== undefined && profile.pitchMax !== undefined
          ? Number((profile.pitchMin + (profile.pitchMax - profile.pitchMin) * context.rng.next()).toFixed(2))
          : 1,
      });
    }
  }
}

function persistActiveState() {
  saveRuntimeState();
}

function clearPersistedState() {
  runtimeState.active = null;
  saveRuntimeState();
}

function normalizeDisasterId(value) {
  return String(value || "").trim().toLowerCase().replace(/[ -]+/g, "_");
}

function formatLocationText(location) {
  const point = floorLocation(location);
  return `${point.x}, ${point.y}, ${point.z}`;
}

function formatTickDuration(ticks) {
  return `${Math.max(0, Math.ceil(ticks / TICKS_PER_SECOND))}s`;
}

function formatNextDisasterText() {
  const config = getRuntimeConfig();
  if (!config.autoSchedule) {
    return "disabled";
  }
  if (!getEnabledDisasterCount()) {
    return "no disasters enabled";
  }
  if (runtimeState.active) {
    return "after the active disaster";
  }
  if (!runtimeState.cooldownUntilTick) {
    return "pending";
  }
  return formatTickDuration(Math.max(0, runtimeState.cooldownUntilTick - getCurrentTick()));
}

function buildDisasterStatusText() {
  const config = getRuntimeConfig();
  const enabledCount = getEnabledDisasterCount();
  if (!runtimeState.active) {
    return `No active disaster. Difficulty: ${getDifficultyLabel(config.difficulty)}. Auto schedule: ${config.autoSchedule ? "On" : "Off"}. Enabled: ${enabledCount}/${DISASTER_DEFINITIONS.length}. Next disaster: ${formatNextDisasterText()}. Recent: ${runtimeState.recentHistory.join(", ") || "none"}.`;
  }

  const definition = getDisasterDefinition(runtimeState.active.disasterId);
  const remaining = Math.max(0, runtimeState.active.endTick - getCurrentTick());
  return `Active: ${definition?.label || runtimeState.active.disasterId}. Remaining: ${formatTickDuration(remaining)}. Epicenter: ${formatLocationText(runtimeState.active.epicenter)}. Difficulty: ${getDifficultyLabel(config.difficulty)}. Auto schedule: ${config.autoSchedule ? "On" : "Off"}. Enabled: ${enabledCount}/${DISASTER_DEFINITIONS.length}. Next disaster: ${formatNextDisasterText()}.`;
}

function shuffleArray(values, rng) {
  const copy = values.slice();
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = rng.int(0, index);
    const entry = copy[index];
    copy[index] = copy[swapIndex];
    copy[swapIndex] = entry;
  }
  return copy;
}

function pushRecentHistory(disasterId) {
  runtimeState.recentHistory = [disasterId, ...runtimeState.recentHistory.filter((value) => value !== disasterId)].slice(0, RECENT_HISTORY_SIZE);
}

function queueDisasterMessage(message, targetEntityId) {
  queueMessage(`[Disasters] ${message}`, targetEntityId);
}

function hasAdminTag(player) {
  if (!player) {
    return false;
  }
  try {
    return player.hasTag(ADMIN_TAG);
  } catch {
    try {
      return player.getTags().includes(ADMIN_TAG);
    } catch {
      return false;
    }
  }
}

function getEligibleCandidates(participants, options = {}) {
  const tick = getCurrentTick();
  const history = new Set(runtimeState.recentHistory);
  const playerOrder = shuffleArray(participants, createRng(hashString(`participants:${tick}`)));
  const candidates = [];
  const respectConfig = options.respectConfig !== false;

  for (const definition of DISASTER_DEFINITIONS) {
    if (respectConfig && !isDisasterEnabledForAuto(definition.id)) {
      continue;
    }
    if (history.has(definition.id)) {
      continue;
    }
    for (const player of playerOrder) {
      const seed = hashString(`${definition.id}:${player.id || player.name}:${tick}`);
      const selectionRng = createRng(seed);
      if (!definition.canAnchor(player, { currentTick: tick, rng: selectionRng })) {
        continue;
      }
      const epicenter = definition.selectEpicenter(player, { currentTick: tick, rng: selectionRng });
      if (!epicenter) {
        continue;
      }
      const point = floorLocation(epicenter);
      candidates.push({
        definition,
        anchor: player,
        epicenter: point,
        seed,
        terrainTags: getTerrainTags(player.dimension, point),
        slopeVector: estimateSlopeDirection(player.dimension, point),
      });
      break;
    }
  }

  return candidates;
}

function pickWeightedCandidate(candidates, rng) {
  if (!candidates.length) {
    return undefined;
  }
  const totalWeight = candidates.reduce((sum, candidate) => {
    return sum + (DISASTER_TIER_WEIGHTS[candidate.definition.tier] || 1);
  }, 0);
  let roll = rng.next() * totalWeight;
  for (const candidate of candidates) {
    roll -= DISASTER_TIER_WEIGHTS[candidate.definition.tier] || 1;
    if (roll <= 0) {
      return candidate;
    }
  }
  return candidates[candidates.length - 1];
}

function startDisaster(definition, candidate, options = {}) {
  if (!definition || !candidate?.anchor) {
    return undefined;
  }

  const startedTick = getCurrentTick();
  const active = normalizeActiveState({
    disasterId: definition.id,
    dimensionId: candidate.anchor.dimension.id,
    epicenter: candidate.epicenter,
    startedTick,
    endTick: startedTick + definition.durationTicks,
    seed: candidate.seed || hashString(`${definition.id}:${startedTick}`),
    blockOpsUsed: 0,
    mobOpsUsed: 0,
    tempRefs: { blocks: [], entities: [] },
    data: {
      terrainTags: candidate.terrainTags || getTerrainTags(candidate.anchor.dimension, candidate.epicenter),
      slopeVector: candidate.slopeVector || estimateSlopeDirection(candidate.anchor.dimension, candidate.epicenter),
      anchorId: candidate.anchor.id || candidate.anchor.name || "anchor",
    },
    forced: !!options.forced,
    blockBudget: definition.blockBudget,
    mobBudget: definition.mobBudget,
  });

  runtimeState.active = active;
  clearNextScheduledDisaster(false);
  pushRecentHistory(definition.id);
  persistActiveState();

  const context = buildDisasterContext(active, definition);
  if (!context.dimension) {
    runtimeState.active = null;
    scheduleNextRandomDisaster({ persist: false, retry: !!options.retrySchedule });
    persistActiveState();
    return undefined;
  }

  try {
    definition.start(active, context);
  } catch {
    cleanupTempRefs(active);
    runtimeState.active = null;
    scheduleNextRandomDisaster({ persist: false, retry: !!options.retrySchedule });
    persistActiveState();
    queueDisasterMessage(`${definition.label} failed to start cleanly and was aborted.`, options.targetEntityId);
    return undefined;
  }

  persistActiveState();
  queueDisasterMessage(`${definition.label} started near ${formatLocationText(active.epicenter)}.`, options.targetEntityId);
  return active;
}

function finishActiveDisaster(reason = "ended", discardPendingBlocks = false, targetEntityId) {
  const active = runtimeState.active;
  if (!active) {
    return false;
  }

  const definition = getDisasterDefinition(active.disasterId);
  const context = buildDisasterContext(active, definition);

  try {
    definition?.finish?.(active, context);
  } catch {
    // Cleanup still runs after finish errors.
  }

  if (discardPendingBlocks) {
    runtimeState.blockQueue = [];
  }
  cleanupTempRefs(active);
  runtimeState.active = null;
  scheduleNextRandomDisaster({ persist: false });
  persistActiveState();

  const label = definition?.label || active.disasterId;
  const suffix = reason === "cancelled" ? "was cancelled." : "has ended.";
  queueDisasterMessage(`${label} ${suffix}`, targetEntityId);
  return true;
}

function cancelActiveDisaster(targetEntityId) {
  if (!runtimeState.active) {
    queueDisasterMessage("No active disaster to cancel.", targetEntityId);
    return false;
  }
  return finishActiveDisaster("cancelled", true, targetEntityId);
}

function tickActiveDisaster() {
  const active = runtimeState.active;
  if (!active) {
    return;
  }

  const definition = getDisasterDefinition(active.disasterId);
  if (!definition) {
    finishActiveDisaster("ended", true);
    return;
  }

  const context = buildDisasterContext(active, definition);
  if (!context.dimension) {
    finishActiveDisaster("ended", true);
    return;
  }

  try {
    definition.tick(active, context);
  } catch {
    finishActiveDisaster("ended", true);
    return;
  }

  emitActiveDisasterFx(active, context);

  if (context.currentTick % 20 === 0) {
    persistActiveState();
  }
  if (context.currentTick >= active.endTick) {
    finishActiveDisaster("ended");
  }
}

function resumeOrRecoverActiveDisaster() {
  const active = runtimeState.active;
  if (!active) {
    return;
  }

  const definition = getDisasterDefinition(active.disasterId);
  if (!definition) {
    cleanupTempRefs(active);
    clearPersistedState();
    return;
  }

  if (getCurrentTick() >= active.endTick) {
    cleanupTempRefs(active);
    clearPersistedState();
    return;
  }

  queueDisasterMessage(`${definition.label} resumed near ${formatLocationText(active.epicenter)}.`);
}

function tryStartRandomDisaster(options = {}) {
  if (runtimeState.active) {
    if (options.notify) {
      queueDisasterMessage("A disaster is already active. Cancel it first.", options.targetEntityId);
    }
    return { started: false, reason: "active" };
  }
  if (options.requireScheduled && (!runtimeState.cooldownUntilTick || getCurrentTick() < runtimeState.cooldownUntilTick)) {
    return { started: false, reason: "not_due" };
  }

  const participants = getParticipantPlayers();
  if (!participants.length) {
    if (options.retryOnFailure) {
      scheduleNextRandomDisaster({ retry: true });
    }
    if (options.notify) {
      queueDisasterMessage("No survival or adventure players are available to anchor a disaster.", options.targetEntityId);
    }
    return { started: false, reason: "no_participants" };
  }

  const candidates = getEligibleCandidates(participants, { respectConfig: options.respectConfig !== false });
  if (!candidates.length) {
    if (options.retryOnFailure) {
      scheduleNextRandomDisaster({ retry: true });
    }
    if (options.notify) {
      const message = getEnabledDisasterCount()
        ? "No enabled disasters found a valid location right now."
        : "No disasters are enabled for automatic scheduling.";
      queueDisasterMessage(message, options.targetEntityId);
    }
    return { started: false, reason: "no_candidates" };
  }

  const picker = createRng(hashString(`disaster-pick:${getCurrentTick()}`));
  const candidate = pickWeightedCandidate(candidates, picker);
  if (!candidate) {
    if (options.retryOnFailure) {
      scheduleNextRandomDisaster({ retry: true });
    }
    return { started: false, reason: "pick_failed" };
  }

  const active = startDisaster(candidate.definition, candidate, {
    targetEntityId: options.targetEntityId,
    retrySchedule: !!options.retryOnFailure,
  });
  if (!active && options.retryOnFailure) {
    scheduleNextRandomDisaster({ retry: true });
  }
  return { started: !!active, reason: active ? "started" : "failed" };
}

function permissionIsElevated(value) {
  if (value === undefined || value === null) {
    return false;
  }
  if (typeof value === "number") {
    return value >= 2;
  }
  const normalized = String(value).toLowerCase();
  return normalized.includes("operator")
    || normalized.includes("admin")
    || normalized.includes("game")
    || normalized.includes("host");
}

function isAuthorizedDebugEvent(event) {
  const source = event?.sourceEntity;
  if (!source || source.typeId !== "minecraft:player") {
    return true;
  }
  try {
    if (permissionIsElevated(source.commandPermissionLevel)) {
      return true;
    }
  } catch {
    // Ignore unavailable command permission values.
  }
  try {
    if (permissionIsElevated(source.playerPermissionLevel)) {
      return true;
    }
  } catch {
    // Ignore unavailable player permission values.
  }
  return false;
}

function reportDisasterStatus(targetEntityId) {
  queueDisasterMessage(buildDisasterStatusText(), targetEntityId);
}

function triggerSpecificDisaster(definition, anchor, options = {}) {
  const targetEntityId = options.targetEntityId;
  if (!definition) {
    queueDisasterMessage(`Unknown disaster id "${options.disasterId || ""}".`, targetEntityId);
    return false;
  }
  if (runtimeState.active) {
    queueDisasterMessage("A disaster is already active. Cancel it first.", targetEntityId);
    return false;
  }
  if (!anchor) {
    queueDisasterMessage("No valid player anchor is available.", targetEntityId);
    return false;
  }

  const tick = getCurrentTick();
  const seed = hashString(`forced:${definition.id}:${anchor.id || anchor.name}:${tick}`);
  const epicenter = definition.selectEpicenter(anchor, { currentTick: tick, rng: createRng(seed), forced: true });
  if (!epicenter) {
    queueDisasterMessage(`No valid epicenter was found for ${definition.label} near the anchor.`, targetEntityId);
    return false;
  }

  return !!startDisaster(
    definition,
    {
      definition,
      anchor,
      epicenter: floorLocation(epicenter),
      seed,
      terrainTags: getTerrainTags(anchor.dimension, epicenter),
      slopeVector: estimateSlopeDirection(anchor.dimension, epicenter),
    },
    { forced: true, targetEntityId }
  );
}

function handleTriggerCommand(event) {
  const disasterId = normalizeDisasterId(event.message);
  const definition = getDisasterDefinition(disasterId);
  const targetEntityId = event?.sourceEntity?.id;

  if (!definition) {
    queueDisasterMessage(`Unknown disaster id "${event.message || ""}".`, targetEntityId);
    return;
  }
  if (runtimeState.active) {
    queueDisasterMessage("A disaster is already active. Cancel it first.", targetEntityId);
    return;
  }

  const participants = getParticipantPlayers();
  const anchor = event?.sourceEntity?.typeId === "minecraft:player" ? event.sourceEntity : participants[0];
  triggerSpecificDisaster(definition, anchor, { disasterId, targetEntityId });
}

async function showFormSafe(form, player) {
  try {
    return await form.show(player);
  } catch {
    queueDisasterMessage("The disaster admin UI could not be opened right now.", player?.id);
    return { canceled: true, cancelationReason: "error" };
  }
}

function canOpenAdminClockMenu(player, itemTypeId) {
  if (!player || player.typeId !== "minecraft:player" || itemTypeId !== CLOCK_ITEM_ID || !hasAdminTag(player)) {
    return false;
  }
  const playerId = player.id || player.name;
  if (!playerId || adminFormState.openPlayers.has(playerId)) {
    return false;
  }
  const tick = getCurrentTick();
  const debounceUntil = adminFormState.useDebounceUntil.get(playerId) || 0;
  if (tick < debounceUntil) {
    return false;
  }
  adminFormState.useDebounceUntil.set(playerId, tick + ADMIN_FORM_DEBOUNCE_TICKS);
  return true;
}

async function showAdminMainMenu(player) {
  const config = getRuntimeConfig();
  const activeDefinition = getDisasterDefinition(runtimeState.active?.disasterId);
  const body = [
    `Difficulty: ${getDifficultyLabel(config.difficulty)}`,
    `Auto Schedule: ${config.autoSchedule ? "On" : "Off"}`,
    `Enabled Disasters: ${getEnabledDisasterCount()}/${DISASTER_DEFINITIONS.length}`,
    `Active Disaster: ${activeDefinition?.label || "None"}`,
    `Next Disaster: ${formatNextDisasterText()}`,
  ].join("\n");

  const response = await showFormSafe(
    new ActionFormData()
      .title("Disaster Admin")
      .body(body)
      .button("Scheduler Settings")
      .button("Disaster Toggles")
      .button("Manual Controls")
      .button("Close"),
    player
  );

  if (response.canceled) {
    return null;
  }

  switch (response.selection) {
    case 0:
      return "scheduler";
    case 1:
      return "toggles";
    case 2:
      return "manual";
    default:
      return null;
  }
}

async function showSchedulerSettingsMenu(player) {
  const config = getRuntimeConfig();
  const response = await showFormSafe(
    new ModalFormData()
      .title("Scheduler Settings")
      .dropdown("Difficulty", DIFFICULTY_IDS.map((id) => DIFFICULTY_SETTINGS[id].label), Math.max(0, DIFFICULTY_IDS.indexOf(config.difficulty)))
      .toggle("Auto schedule", config.autoSchedule),
    player
  );

  if (response.canceled) {
    return "main";
  }

  const formValues = Array.isArray(response.formValues) ? response.formValues : [];
  const difficultyIndex = Number(formValues[0] ?? 0);
  const difficulty = DIFFICULTY_IDS[difficultyIndex] || config.difficulty;
  const autoSchedule = !!formValues[1];
  applyDisasterConfig({
    ...config,
    difficulty,
    autoSchedule,
  });
  queueDisasterMessage(
    `Scheduler updated. Difficulty: ${getDifficultyLabel(difficulty)}. Auto schedule: ${autoSchedule ? "On" : "Off"}. Next disaster: ${formatNextDisasterText()}.`,
    player.id
  );
  return "main";
}

async function showDisasterToggleMenu(player) {
  const config = getRuntimeConfig();
  const form = new ModalFormData().title("Disaster Toggles");
  for (const definition of DISASTER_DEFINITIONS) {
    form.toggle(`${definition.label} (${definition.tier})`, config.enabledDisasters[definition.id] !== false);
  }

  const response = await showFormSafe(form, player);
  if (response.canceled) {
    return "main";
  }

  const formValues = Array.isArray(response.formValues) ? response.formValues : [];
  const enabledDisasters = {};
  DISASTER_DEFINITIONS.forEach((definition, index) => {
    enabledDisasters[definition.id] = formValues[index] !== false;
  });
  applyDisasterConfig({
    ...config,
    enabledDisasters,
  });
  queueDisasterMessage(
    `Disaster rotation updated. Enabled: ${getEnabledDisasterCount()}/${DISASTER_DEFINITIONS.length}. Next disaster: ${formatNextDisasterText()}.`,
    player.id
  );
  return "main";
}

async function confirmCancelActiveDisaster(player) {
  if (!runtimeState.active) {
    queueDisasterMessage("No active disaster to cancel.", player.id);
    return;
  }
  const response = await showFormSafe(
    new MessageFormData()
      .title("Cancel Disaster")
      .body("Cancel the active disaster now?")
      .button1("Keep Running")
      .button2("Cancel Disaster"),
    player
  );

  if (response.canceled) {
    return;
  }

  if (response.selection === 1 || response.selection === true) {
    cancelActiveDisaster(player.id);
  }
}

async function showSpecificDisasterTriggerMenu(player) {
  const form = new ActionFormData()
    .title("Trigger Specific Disaster")
    .body("Select a disaster to force near your current position.");
  for (const definition of DISASTER_DEFINITIONS) {
    const autoState = isDisasterEnabledForAuto(definition.id) ? "" : " [auto off]";
    form.button(`${definition.label}${autoState}`);
  }

  const response = await showFormSafe(form, player);
  if (response.canceled) {
    return "manual";
  }

  const definition = DISASTER_DEFINITIONS[Number(response.selection)];
  if (definition) {
    triggerSpecificDisaster(definition, player, { disasterId: definition.id, targetEntityId: player.id });
  }
  return "manual";
}

async function showManualControlsMenu(player) {
  const response = await showFormSafe(
    new ActionFormData()
      .title("Manual Controls")
      .body(buildDisasterStatusText())
      .button("Start Random Now")
      .button("Trigger Specific Disaster")
      .button("Cancel Active Disaster")
      .button("Show Status")
      .button("Back"),
    player
  );

  if (response.canceled) {
    return "main";
  }

  switch (response.selection) {
    case 0:
      tryStartRandomDisaster({ notify: true, targetEntityId: player.id });
      return "manual";
    case 1:
      return "trigger";
    case 2:
      await confirmCancelActiveDisaster(player);
      return "manual";
    case 3:
      reportDisasterStatus(player.id);
      return "manual";
    default:
      return "main";
  }
}

async function openAdminClockMenu(player) {
  const playerId = player?.id || player?.name;
  if (!playerId || adminFormState.openPlayers.has(playerId)) {
    return;
  }

  adminFormState.openPlayers.add(playerId);
  try {
    let view = "main";
    while (view) {
      if (!hasAdminTag(player)) {
        break;
      }
      switch (view) {
        case "scheduler":
          view = await showSchedulerSettingsMenu(player);
          break;
        case "toggles":
          view = await showDisasterToggleMenu(player);
          break;
        case "manual":
          view = await showManualControlsMenu(player);
          break;
        case "trigger":
          view = await showSpecificDisasterTriggerMenu(player);
          break;
        case "main":
        default:
          view = await showAdminMainMenu(player);
          break;
      }
    }
  } finally {
    adminFormState.openPlayers.delete(playerId);
  }
}

function handleAdminClockUse(event) {
  initializeRuntime();
  const player = event?.source || event?.sourceEntity;
  const itemTypeId = event?.itemStack?.typeId || event?.item?.typeId;
  if (!canOpenAdminClockMenu(player, itemTypeId)) {
    return;
  }
  system.run(() => {
    openAdminClockMenu(player);
  });
}

function handleScriptEvent(event) {
  initializeRuntime();
  if (!String(event?.id || "").startsWith("disasters:")) {
    return;
  }
  if (!isAuthorizedDebugEvent(event)) {
    queueDisasterMessage("Debug disaster commands require operator-level permissions.", event?.sourceEntity?.id);
    return;
  }

  switch (event.id) {
    case "disasters:trigger":
      handleTriggerCommand(event);
      break;
    case "disasters:cancel":
      cancelActiveDisaster(event?.sourceEntity?.id);
      break;
    case "disasters:status":
      reportDisasterStatus(event?.sourceEntity?.id);
      break;
    default:
      break;
  }
}

function initializeRuntime() {
  if (initialized) {
    return;
  }
  initialized = true;
  restoreRuntimeState();
  resumeOrRecoverActiveDisaster();
  ensureScheduledDisasterTick();
  persistActiveState();

  system.runInterval(() => {
    processBlockQueue();
    if (runtimeState.active) {
      tickActiveDisaster();
    } else if (
      getCurrentTick() % SCHEDULER_INTERVAL === 0
      && getRuntimeConfig().autoSchedule
      && runtimeState.cooldownUntilTick
      && getCurrentTick() >= runtimeState.cooldownUntilTick
    ) {
      tryStartRandomDisaster({ requireScheduled: true, retryOnFailure: true });
    }
    flushPendingMessages();
  }, 1);
}

try {
  world.afterEvents.worldLoad.subscribe(() => {
    initializeRuntime();
  });
} catch {
  // Fall back to timeout initialization if worldLoad is unavailable.
}

try {
  system.afterEvents.scriptEventReceive.subscribe((event) => {
    handleScriptEvent(event);
  });
} catch {
  // Ignore missing script event support in older runtimes.
}

try {
  world.afterEvents.itemUse.subscribe((event) => {
    handleAdminClockUse(event);
  });
} catch {
  // Ignore missing item use support in older runtimes.
}

system.runTimeout(() => {
  initializeRuntime();
}, 0);

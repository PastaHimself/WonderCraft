import { ItemStack, system, world } from "@minecraft/server";
import { ChestFormData } from "./extensions/forms.js";

const ORE_WASHER_COMPONENT = "wondercraft:ore_washer";
const ORE_WASHER_INPUT = "minecraft:cobblestone";
const ORE_WASHER_WATTS = 25;
const ORE_WASHER_CYCLE_TICKS = 20;
const ORE_WASHER_INPUT_CAPACITY = 64;
const ORE_WASHER_OUTPUT_CAPACITY = 64;
const ORE_WASHER_OUTPUTS = [
  "wondercraft:aluminum_dust",
  "wondercraft:copper_dust",
  "wondercraft:gold_dust",
  "wondercraft:iron_dust",
  "wondercraft:lead_dust",
  "wondercraft:silver_dust",
  "wondercraft:tin_dust",
  "wondercraft:zinc_dust",
];

const ENERGY_STATE_KEY = "wondercraft:energy_state";
const HOLOGRAM_TYPE_ID = "traye:text_entity";
const HOLOGRAM_TAG = "wondercraft_energy_hologram";
const DISCOVERY_RADIUS = 16;
const DISCOVERY_HEIGHT = 8;
const REGULATOR_DEFAULTS = {
  capacity: 10000,
  maxInput: 2000,
  maxOutput: 2000,
};
const OVERWORLD_IDS = new Set(["overworld", "minecraft:overworld"]);

const ENERGY_NODE_DEFS = {
  "wondercraft:basic_solar_panel": {
    kind: "generator",
    rate: 10,
    maxInput: 0,
    maxOutput: 10,
    capacity: 0,
    canGenerate: true,
  },
  "wondercraft:advanced_solar_panel": {
    kind: "generator",
    rate: 25,
    maxInput: 0,
    maxOutput: 25,
    capacity: 0,
    canGenerate: true,
  },
  "wondercraft:reinforced_solar_panel": {
    kind: "generator",
    rate: 60,
    maxInput: 0,
    maxOutput: 60,
    capacity: 0,
    canGenerate: true,
  },
  "wondercraft:industrial_solar_panel": {
    kind: "generator",
    rate: 150,
    maxInput: 0,
    maxOutput: 150,
    capacity: 0,
    canGenerate: true,
  },
  "wondercraft:elite_solar_panel": {
    kind: "generator",
    rate: 400,
    maxInput: 0,
    maxOutput: 400,
    capacity: 0,
    canGenerate: true,
  },
  "wondercraft:quantum_solar_panel": {
    kind: "generator",
    rate: 1000,
    maxInput: 0,
    maxOutput: 1000,
    capacity: 0,
    canGenerate: true,
  },
  "wondercraft:energy_connector": {
    kind: "transport",
    rate: 0,
    maxInput: 0,
    maxOutput: 0,
    capacity: 0,
    canGenerate: false,
  },
  "wondercraft:ore_washer": {
    kind: "consumer",
    rate: ORE_WASHER_WATTS,
    maxInput: ORE_WASHER_WATTS,
    maxOutput: 0,
    capacity: 0,
    canGenerate: false,
  },
  "wondercraft:energy_regulator": {
    kind: "storage",
    rate: 0,
    maxInput: REGULATOR_DEFAULTS.maxInput,
    maxOutput: REGULATOR_DEFAULTS.maxOutput,
    capacity: REGULATOR_DEFAULTS.capacity,
    canGenerate: false,
  },
};

const ENERGY_BLOCK_IDS = new Set(Object.keys(ENERGY_NODE_DEFS));
const DIRECTIONS = [
  { x: 1, y: 0, z: 0 },
  { x: -1, y: 0, z: 0 },
  { x: 0, y: 1, z: 0 },
  { x: 0, y: -1, z: 0 },
  { x: 0, y: 0, z: 1 },
  { x: 0, y: 0, z: -1 },
];

const trackedNodes = new Map();
const regulatorCharge = new Map();
const washerStates = new Map();
const hologramEntityIds = new Map();
const openWasherMenus = new Set();

let stateDirty = false;

system.beforeEvents.startup.subscribe((initEvent) => {
  initEvent.blockComponentRegistry.registerCustomComponent(ORE_WASHER_COMPONENT, {
    onPlayerInteract: (event) => {
      void openOreWasherMenu(event.player, event.block);
    },
  });
});

system.run(() => {
  loadEnergyState();
});

system.runInterval(() => {
  refreshEnergySystem();
}, 20);

system.runInterval(() => {
  refreshOreWasherSystem();
}, 1);

function refreshEnergySystem() {
  discoverEnergyBlocksNearPlayers();
  pruneTrackedNodes();
  simulateNetworks();
  saveEnergyStateIfDirty();
}

function refreshOreWasherSystem() {
  for (const node of trackedNodes.values()) {
    if (node.descriptor.kind !== "consumer") {
      continue;
    }

    refreshOreWasher(node);
  }

  saveEnergyStateIfDirty();
}

function discoverEnergyBlocksNearPlayers() {
  for (const player of world.getPlayers()) {
    const dimension = player.dimension;
    const origin = floorLocation(player.location);

    for (let x = origin.x - DISCOVERY_RADIUS; x <= origin.x + DISCOVERY_RADIUS; x++) {
      for (let y = origin.y - DISCOVERY_HEIGHT; y <= origin.y + DISCOVERY_HEIGHT; y++) {
        for (let z = origin.z - DISCOVERY_RADIUS; z <= origin.z + DISCOVERY_RADIUS; z++) {
          let block;
          try {
            block = dimension.getBlock({ x, y, z });
          } catch {
            continue;
          }

          if (!block || !ENERGY_BLOCK_IDS.has(block.typeId)) {
            continue;
          }

          registerEnergyNode(block);
        }
      }
    }
  }
}

function pruneTrackedNodes() {
  for (const [key, node] of trackedNodes) {
    const dimension = getDimensionSafe(node.dimensionId);
    if (!dimension) {
      continue;
    }

    let block;
    try {
      block = dimension.getBlock(node.location);
    } catch {
      continue;
    }

    if (block && block.typeId === node.typeId) {
      continue;
    }

    trackedNodes.delete(key);
    hologramEntityIds.delete(key);

    if (node.descriptor.kind === "storage") {
      regulatorCharge.delete(key);
      removeHologramForNode(node);
      stateDirty = true;
    }

    if (node.descriptor.kind === "consumer") {
      washerStates.delete(key);
      stateDirty = true;
    }

    if (node.descriptor.kind === "generator") {
      removeHologramForNode(node);
    }
  }
}

function simulateNetworks() {
  const visited = new Set();

  for (const [key, node] of trackedNodes) {
    if (visited.has(key)) {
      continue;
    }

    const network = collectNetwork(node, visited);
    applyEnergyNetwork(network);
  }
}

function collectNetwork(startNode, visited) {
  const queue = [startNode];
  const nodes = [];

  while (queue.length > 0) {
    const node = queue.shift();
    const key = makeNodeKey(node.dimensionId, node.location);
    if (visited.has(key)) {
      continue;
    }

    visited.add(key);
    nodes.push(node);

    for (const direction of DIRECTIONS) {
      const neighborKey = makeNodeKey(
        node.dimensionId,
        addVector(node.location, direction),
      );

      const neighbor = trackedNodes.get(neighborKey);
      if (!neighbor || visited.has(neighborKey)) {
        continue;
      }

      queue.push(neighbor);
    }
  }

  return nodes;
}

function applyEnergyNetwork(nodes) {
  const generators = nodes.filter((node) => node.descriptor.kind === "generator");
  const storages = nodes.filter((node) => node.descriptor.kind === "storage");

  for (const generator of generators) {
    removeHologramForNode(generator);
  }

  if (generators.length === 0) {
    for (const storage of storages) {
      syncRegulatorHologram(storage, 0);
    }
    return;
  }

  if (storages.length === 0) {
    return;
  }

  const availableByPanel = generators.map((generator) => ({
    key: generator.key,
    watts: getSolarProduction(generator),
    node: generator,
  }));

  const totalAvailable = availableByPanel.reduce((sum, panel) => sum + panel.watts, 0);

  const storageBudgets = storages.map((storageNode) => {
    const current = regulatorCharge.get(storageNode.key) ?? 0;
    const freeSpace = Math.max(storageNode.descriptor.capacity - current, 0);
    return {
      node: storageNode,
      budget: Math.min(freeSpace, storageNode.descriptor.maxInput),
    };
  });

  const totalBudget = storageBudgets.reduce((sum, storage) => sum + storage.budget, 0);
  const acceptedTotal = Math.min(totalAvailable, totalBudget);
  const acceptedByStorage = new Map(
    storages.map((storageNode) => [storageNode.key, 0]),
  );

  let remaining = acceptedTotal;
  for (const storage of storageBudgets) {
    if (remaining <= 0) {
      break;
    }

    const accepted = Math.min(storage.budget, remaining);
    const current = regulatorCharge.get(storage.node.key) ?? 0;
    regulatorCharge.set(storage.node.key, current + accepted);
    acceptedByStorage.set(storage.node.key, accepted);
    remaining -= accepted;
    stateDirty = true;
  }

  for (const storage of storages) {
    const accepted = acceptedByStorage.get(storage.key) ?? 0;
    syncRegulatorHologram(storage, accepted);
  }
}

function refreshOreWasher(node) {
  const dimension = getDimensionSafe(node.dimensionId);
  if (!dimension) {
    return;
  }

  const block = getBlockSafe(dimension, node.location);
  if (!block || block.typeId !== node.typeId) {
    return;
  }

  const state = getOrCreateWasherState(node.key);
  syncWasherHoppers(node, state);

  if (state.input <= 0) {
    if (state.progress !== 0 || state.activeOutputSlot !== null) {
      state.progress = 0;
      state.activeOutputSlot = null;
      stateDirty = true;
    }
    return;
  }

  if (state.activeOutputSlot === null) {
    const nextOutputSlot = pickAvailableWasherOutputSlot(state);
    if (nextOutputSlot === null) {
      if (state.progress !== 0) {
        state.progress = 0;
        stateDirty = true;
      }
      return;
    }

    if (!consumeEnergyForBlock(node, ORE_WASHER_WATTS)) {
      if (state.progress !== 0) {
        state.progress = 0;
        stateDirty = true;
      }
      return;
    }

    state.activeOutputSlot = nextOutputSlot;
    state.progress = 0;
    stateDirty = true;
  }

  const outputIndex = state.activeOutputSlot - 1;
  if (outputIndex < 0 || outputIndex >= ORE_WASHER_OUTPUTS.length) {
    state.activeOutputSlot = null;
    state.progress = 0;
    stateDirty = true;
    return;
  }

  if ((state.outputs[outputIndex] ?? 0) >= ORE_WASHER_OUTPUT_CAPACITY) {
    return;
  }

  state.progress += 1;
  if (state.progress < ORE_WASHER_CYCLE_TICKS) {
    return;
  }

  state.input -= 1;
  state.outputs[outputIndex] = (state.outputs[outputIndex] ?? 0) + 1;
  state.progress = 0;
  state.activeOutputSlot = null;
  stateDirty = true;
}

async function openOreWasherMenu(player, block) {
  const playerKey = getPlayerKey(player);
  if (openWasherMenus.has(playerKey)) {
    return;
  }

  openWasherMenus.add(playerKey);

  try {
    const dimension = getDimensionSafe(block.dimension.id);
    if (!dimension) {
      return;
    }

    registerEnergyNode(block);
    const nodeKey = makeNodeKey(block.dimension.id, floorLocation(block.location));
    const node = trackedNodes.get(nodeKey);
    if (!node || node.descriptor.kind !== "consumer") {
      return;
    }

    while (true) {
      const currentBlock = getBlockSafe(dimension, node.location);
      if (!currentBlock || currentBlock.typeId !== node.typeId) {
        return;
      }

      const state = getOrCreateWasherState(node.key);
      const form = buildOreWasherForm(node, state);
      let response;
      try {
        response = await form.show(player);
      } catch {
        return;
      }

      if (response.canceled) {
        return;
      }

      const selection = response.selection ?? -1;
      const changed = handleWasherMenuSelection(player, node, state, selection);
      if (changed) {
        stateDirty = true;
      }
    }
  } finally {
    openWasherMenus.delete(playerKey);
  }
}

function buildOreWasherForm(node, state) {
  const form = new ChestFormData(2);
  const progressText =
    state.activeOutputSlot === null ? "Idle" : `${state.progress}/${ORE_WASHER_CYCLE_TICKS}`;
  const powerText = `Power: ${ORE_WASHER_WATTS} W/s`;
  const storedDust = state.outputs.reduce((sum, count) => sum + count, 0);
  const inputLore = [
    `Cobblestone: ${state.input}/${ORE_WASHER_INPUT_CAPACITY}`,
    `Cycle: ${progressText}`,
    powerText,
    "Click to load cobblestone from your selected hotbar slot.",
  ];

  form.title("Ore Washer");
  form.button(
    0,
    "Input",
    inputLore,
    ORE_WASHER_INPUT,
    Math.max(0, Math.min(state.input, 99)),
    0,
    state.activeOutputSlot === null && state.input > 0,
  );

  form.button(
    1,
    "Random Dust",
    [
      `Stored: ${storedDust}/${ORE_WASHER_OUTPUT_CAPACITY}`,
      `Cycle: ${progressText}`,
      "Click to collect one random dust type.",
    ],
    ORE_WASHER_OUTPUTS[0],
    Math.max(0, Math.min(storedDust, 99)),
  );

  return form;
}

function handleWasherMenuSelection(player, node, state, selection) {
  if (selection === 0) {
    return insertSelectedCobblestone(player, state);
  }

  if (selection === 1) {
    return withdrawRandomWasherOutputToPlayer(player, state);
  }

  return false;
}

function insertSelectedCobblestone(player, state) {
  const container = getPlayerInventoryContainer(player);
  if (!container) {
    return false;
  }

  const slot = container.getSlot(player.selectedSlotIndex);
  const item = slot.getItem();
  if (!item || item.typeId !== ORE_WASHER_INPUT || item.amount < 1) {
    return false;
  }

  const room = ORE_WASHER_INPUT_CAPACITY - state.input;
  if (room <= 0) {
    return false;
  }

  const moved = Math.min(item.amount, room);
  state.input += moved;
  const newAmount = item.amount - moved;

  if (newAmount > 0) {
    item.amount = newAmount;
    slot.setItem(item);
  } else {
    slot.setItem(undefined);
  }

  return moved > 0;
}

function withdrawWasherOutputToPlayer(player, state, outputIndex) {
  const count = state.outputs[outputIndex] ?? 0;
  if (count <= 0) {
    return false;
  }

  const container = getPlayerInventoryContainer(player);
  if (!container) {
    return false;
  }

  const itemType = ORE_WASHER_OUTPUTS[outputIndex];
  const moved = insertItemsIntoContainer(container, itemType, count);
  if (moved <= 0) {
    return false;
  }

  state.outputs[outputIndex] -= moved;
  return true;
}

function withdrawRandomWasherOutputToPlayer(player, state) {
  const availableOutputs = [];
  for (let index = 0; index < ORE_WASHER_OUTPUTS.length; index++) {
    if ((state.outputs[index] ?? 0) > 0) {
      availableOutputs.push(index);
    }
  }

  if (availableOutputs.length === 0) {
    return false;
  }

  const outputIndex = availableOutputs[Math.floor(Math.random() * availableOutputs.length)];
  return withdrawWasherOutputToPlayer(player, state, outputIndex);
}

function syncWasherHoppers(node, state) {
  const dimension = getDimensionSafe(node.dimensionId);
  if (!dimension) {
    return;
  }

  const above = getBlockSafe(dimension, addVector(node.location, { x: 0, y: 1, z: 0 }));
  if (above?.typeId === "minecraft:hopper") {
    const container = getBlockInventoryContainer(above);
    if (container) {
      pullCobblestoneFromContainer(container, state);
    }
  }

  const below = getBlockSafe(dimension, addVector(node.location, { x: 0, y: -1, z: 0 }));
  if (below?.typeId === "minecraft:hopper") {
    const container = getBlockInventoryContainer(below);
    if (container) {
      pushOutputsToContainer(container, state);
    }
  }
}

function pullCobblestoneFromContainer(container, state) {
  const room = ORE_WASHER_INPUT_CAPACITY - state.input;
  if (room <= 0) {
    return false;
  }

  const moved = removeItemsFromContainer(container, ORE_WASHER_INPUT, 1);
  if (moved <= 0) {
    return false;
  }

  state.input += moved;
  stateDirty = true;
  return true;
}

function pushOutputsToContainer(container, state) {
  for (let index = 0; index < ORE_WASHER_OUTPUTS.length; index++) {
    const count = state.outputs[index] ?? 0;
    if (count <= 0) {
      continue;
    }

    const itemType = ORE_WASHER_OUTPUTS[index];
    const moved = insertItemsIntoContainer(container, itemType, 1);
    if (moved <= 0) {
      continue;
    }

    state.outputs[index] -= moved;
    stateDirty = true;
    return true;
  }

  return false;
}

function pickAvailableWasherOutputSlot(state) {
  const openSlots = [];
  for (let index = 0; index < ORE_WASHER_OUTPUTS.length; index++) {
    if ((state.outputs[index] ?? 0) < ORE_WASHER_OUTPUT_CAPACITY) {
      openSlots.push(index + 1);
    }
  }

  if (openSlots.length === 0) {
    return null;
  }

  return openSlots[Math.floor(Math.random() * openSlots.length)];
}

function getOrCreateWasherState(nodeKey) {
  let state = washerStates.get(nodeKey);
  if (state) {
    return state;
  }

  state = createDefaultWasherState();
  washerStates.set(nodeKey, state);
  return state;
}

function createDefaultWasherState() {
  return {
    input: 0,
    outputs: Array(ORE_WASHER_OUTPUTS.length).fill(0),
    progress: 0,
    activeOutputSlot: null,
  };
}

function normalizeWasherState(rawState) {
  const state = createDefaultWasherState();
  if (!rawState || typeof rawState !== "object") {
    return state;
  }

  state.input = clampInteger(Number(rawState.input) || 0, 0, ORE_WASHER_INPUT_CAPACITY);
  state.progress = clampInteger(Number(rawState.progress) || 0, 0, ORE_WASHER_CYCLE_TICKS);
  const activeOutputSlot = Number(rawState.activeOutputSlot);
  if (Number.isInteger(activeOutputSlot) && activeOutputSlot >= 1 && activeOutputSlot <= ORE_WASHER_OUTPUTS.length) {
    state.activeOutputSlot = activeOutputSlot;
  }

  const rawOutputs = Array.isArray(rawState.outputs) ? rawState.outputs : [];
  for (let index = 0; index < ORE_WASHER_OUTPUTS.length; index++) {
    state.outputs[index] = clampInteger(Number(rawOutputs[index]) || 0, 0, ORE_WASHER_OUTPUT_CAPACITY);
  }

  return state;
}

function serializeWasherState(state) {
  return {
    input: state.input,
    outputs: state.outputs,
    progress: state.progress,
    activeOutputSlot: state.activeOutputSlot,
  };
}

function getPlayerInventoryContainer(player) {
  const inventory = player.getComponent("minecraft:inventory");
  return inventory?.container;
}

function getBlockInventoryContainer(block) {
  const inventory = block.getComponent("minecraft:inventory");
  return inventory?.container;
}

function insertItemsIntoContainer(container, itemType, amount) {
  let remaining = amount;

  for (let slotIndex = 0; slotIndex < container.size && remaining > 0; slotIndex++) {
    const slot = container.getSlot(slotIndex);
    const existing = slot.getItem();
    if (!existing || existing.typeId !== itemType) {
      continue;
    }

    const room = Math.max(64 - existing.amount, 0);
    if (room <= 0) {
      continue;
    }

    const moved = Math.min(room, remaining);
    existing.amount += moved;
    slot.setItem(existing);
    remaining -= moved;
  }

  for (let slotIndex = 0; slotIndex < container.size && remaining > 0; slotIndex++) {
    const slot = container.getSlot(slotIndex);
    const existing = slot.getItem();
    if (existing) {
      continue;
    }

    const moved = Math.min(64, remaining);
    slot.setItem(new ItemStack(itemType, moved));
    remaining -= moved;
  }

  return amount - remaining;
}

function removeItemsFromContainer(container, itemType, amount) {
  if (amount <= 0) {
    return 0;
  }

  let remaining = amount;

  for (let slotIndex = 0; slotIndex < container.size && remaining > 0; slotIndex++) {
    const slot = container.getSlot(slotIndex);
    const existing = slot.getItem();
    if (!existing || existing.typeId !== itemType) {
      continue;
    }

    const moved = Math.min(existing.amount, remaining);
    const newAmount = existing.amount - moved;
    remaining -= moved;

    if (newAmount > 0) {
      existing.amount = newAmount;
      slot.setItem(existing);
    } else {
      slot.setItem(undefined);
    }
  }

  return amount - remaining;
}

function getReadableName(typeId) {
  return typeId
    .split(":")
    .pop()
    .replace(/_/g, " ")
    .replace(/(^\w|\s\w)/g, (match) => match.toUpperCase());
}

function consumeEnergyForBlock(block, watts) {
  const location = floorLocation(block.location);
  const key = makeNodeKey(block.dimension.id, location);

  registerEnergyNode(block);
  const node = trackedNodes.get(key);
  if (!node) {
    return false;
  }

  const network = collectNetwork(node, new Set());
  const storages = network.filter((networkNode) => networkNode.descriptor.kind === "storage");
  const available = storages.reduce(
    (sum, storage) => sum + (regulatorCharge.get(storage.key) ?? 0),
    0,
  );

  if (available < watts) {
    return false;
  }

  let remaining = watts;
  const orderedStorages = [...storages].sort((left, right) => {
    return (regulatorCharge.get(right.key) ?? 0) - (regulatorCharge.get(left.key) ?? 0);
  });

  for (const storage of orderedStorages) {
    if (remaining <= 0) {
      break;
    }

    const current = regulatorCharge.get(storage.key) ?? 0;
    const used = Math.min(current, remaining);
    if (used <= 0) {
      continue;
    }

    regulatorCharge.set(storage.key, current - used);
    remaining -= used;
    stateDirty = true;
  }

  return remaining <= 0;
}

function getSolarProduction(node) {
  const dimension = getDimensionSafe(node.dimensionId);
  if (!dimension || !OVERWORLD_IDS.has(node.dimensionId)) {
    return 0;
  }

  let block;
  try {
    block = dimension.getBlock(node.location);
  } catch {
    return 0;
  }

  if (!block) {
    return 0;
  }

  const aboveLocation = addVector(node.location, { x: 0, y: 1, z: 0 });
  if (!hasOpenSky(dimension, block, aboveLocation)) {
    return 0;
  }

  const timeOfDay = getWorldTimeOfDay();
  if (timeOfDay < 1000 || timeOfDay >= 13000) {
    return 0;
  }

  return Math.floor(node.descriptor.rate * getWeatherMultiplier(dimension));
}

function syncRegulatorHologram(node, watts) {
  const hologram = getOrCreateHologramForNode(node);
  if (!hologram) {
    return;
  }

  hologram.setProperty("traye:visible", true);
  hologram.setProperty("traye:see_through_walls", false);
  hologram.teleport(centeredAbove(node.location, 1.65), {
    dimension: getDimensionSafe(node.dimensionId),
  });

  writeWattsToEntity(hologram, `${watts} W`);
}

function getOrCreateHologramForNode(node) {
  const dimension = getDimensionSafe(node.dimensionId);
  if (!dimension) {
    return undefined;
  }

  const existingId = hologramEntityIds.get(node.key);
  if (existingId) {
    const existingEntity = world.getEntity(existingId);
    if (entityIsValid(existingEntity)) {
      return existingEntity;
    }
  }

  const specificTag = makeHologramTag(node.key);
  const nearby = dimension.getEntities({
    type: HOLOGRAM_TYPE_ID,
    tags: [HOLOGRAM_TAG, specificTag],
    location: centeredAbove(node.location, 1.65),
    maxDistance: 2,
  });

  if (nearby.length > 0) {
    const [primary, ...duplicates] = nearby;
    for (const duplicate of duplicates) {
      duplicate.remove();
    }

    hologramEntityIds.set(node.key, primary.id);
    return primary;
  }

  const hologram = spawnCustomEntity(dimension, HOLOGRAM_TYPE_ID, centeredAbove(node.location, 1.65));
  hologram.addTag(HOLOGRAM_TAG);
  hologram.addTag(specificTag);
  hologram.setProperty("traye:visible", true);
  hologram.setProperty("traye:see_through_walls", false);
  hologramEntityIds.set(node.key, hologram.id);
  return hologram;
}

function removeHologramForNode(node) {
  const dimension = getDimensionSafe(node.dimensionId);
  if (!dimension) {
    return;
  }

  const specificTag = makeHologramTag(node.key);
  const holograms = dimension.getEntities({
    type: HOLOGRAM_TYPE_ID,
    tags: [HOLOGRAM_TAG, specificTag],
    location: centeredAbove(node.location, 1.65),
    maxDistance: 4,
  });

  for (const hologram of holograms) {
    hologram.remove();
  }
}

/**
 * Spawns a custom entity without narrowing the identifier to the vanilla-only
 * overload used by the default Bedrock typings.
 *
 * @param {import("@minecraft/server").Dimension} dimension
 * @param {string} typeId
 * @param {import("@minecraft/server").Vector3} location
 */
function spawnCustomEntity(dimension, typeId, location) {
  return dimension.spawnEntity(/** @type {any} */ (typeId), location);
}

function writeWattsToEntity(textEntity, message) {
  const safeMessage = message.slice(0, 30);

  let letterIndex = 0;
  for (const character of safeMessage) {
    const position = getFontPosition(character);
    const width = getFontWidth(character);
    const packed = packLetterData(position.x, position.y, width, 3, 3, 3);
    textEntity.setProperty(`traye:letter_${letterIndex + 1}_data`, packed);
    letterIndex += 1;
  }

  for (let index = letterIndex; index < 30; index++) {
    textEntity.setProperty(`traye:letter_${index + 1}_data`, 0);
  }
}

function packLetterData(x, y, width, red, green, blue) {
  return ((x << 16) | (y << 10) | (width << 6) | (red << 4) | (green << 2) | blue) >>> 0;
}

function getFontPosition(character) {
  const ascii = character.charCodeAt(0);
  return {
    x: ascii % 16,
    y: Math.floor(ascii / 16),
  };
}

function getFontWidth(character) {
  if (character === " ") {
    return 4;
  }

  if (character === "1") {
    return 5;
  }

  return 6;
}

function registerEnergyNode(block) {
  const descriptor = ENERGY_NODE_DEFS[block.typeId];
  if (!descriptor) {
    return;
  }

  const location = floorLocation(block.location);
  const key = makeNodeKey(block.dimension.id, location);
  trackedNodes.set(key, {
    key,
    typeId: block.typeId,
    dimensionId: block.dimension.id,
    location,
    descriptor,
  });

  if (descriptor.kind === "storage" && !regulatorCharge.has(key)) {
    regulatorCharge.set(key, 0);
    stateDirty = true;
  }
}

function hasOpenSky(dimension, block, aboveLocation) {
  if (typeof dimension.getSkyLightLevel === "function") {
    return dimension.getSkyLightLevel(aboveLocation) >= 15;
  }

  if (typeof block.above === "function") {
    const aboveBlock = block.above();
    return aboveBlock?.typeId === "minecraft:air";
  }

  return true;
}

function getWorldTimeOfDay() {
  if (typeof world.getTimeOfDay === "function") {
    return world.getTimeOfDay();
  }

  if (typeof world.getAbsoluteTime === "function") {
    return world.getAbsoluteTime() % 24000;
  }

  return 0;
}

function getWeatherMultiplier(dimension) {
  if (typeof dimension.getWeather !== "function") {
    return 1;
  }

  const weatherId = `${dimension.getWeather()}`.toLowerCase();
  if (weatherId.includes("rain") || weatherId.includes("thunder")) {
    return 0.5;
  }

  return 1;
}

function entityIsValid(entity) {
  if (!entity) {
    return false;
  }

  if (typeof entity.isValid === "function") {
    return entity.isValid();
  }

  return true;
}

function loadEnergyState() {
  try {
    const rawState = world.getDynamicProperty(ENERGY_STATE_KEY);
    if (typeof rawState !== "string" || rawState.length === 0) {
      return;
    }

    const parsed = JSON.parse(rawState);
    const savedRegulators = parsed.regulators ?? {};
    for (const [key, charge] of Object.entries(savedRegulators)) {
      regulatorCharge.set(key, Number(charge) || 0);
    }

    const savedWashers = parsed.washers ?? {};
    for (const [key, washerState] of Object.entries(savedWashers)) {
      washerStates.set(key, normalizeWasherState(washerState));
    }
  } catch {
    regulatorCharge.clear();
    washerStates.clear();
  }
}

function saveEnergyStateIfDirty() {
  if (!stateDirty) {
    return;
  }

  const washers = {};
  for (const [key, state] of washerStates) {
    washers[key] = serializeWasherState(state);
  }

  const serialized = JSON.stringify({
    regulators: Object.fromEntries(regulatorCharge),
    washers,
  });

  try {
    world.setDynamicProperty(ENERGY_STATE_KEY, serialized);
    stateDirty = false;
  } catch {
    // Ignore write failures so the simulation can continue.
  }
}

function makeNodeKey(dimensionId, location) {
  return `${dimensionId}|${location.x},${location.y},${location.z}`;
}

function makeHologramTag(nodeKey) {
  return `wc_holo_${nodeKey.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
}

function centeredAbove(location, offsetY) {
  return {
    x: location.x + 0.5,
    y: location.y + offsetY,
    z: location.z + 0.5,
  };
}

function addVector(location, direction) {
  return {
    x: location.x + direction.x,
    y: location.y + direction.y,
    z: location.z + direction.z,
  };
}

function floorLocation(location) {
  return {
    x: Math.floor(location.x),
    y: Math.floor(location.y),
    z: Math.floor(location.z),
  };
}

function getDimensionSafe(dimensionId) {
  try {
    return world.getDimension(dimensionId);
  } catch {
    return undefined;
  }
}

function getBlockSafe(dimension, location) {
  try {
    return dimension.getBlock(location);
  } catch {
    return undefined;
  }
}

function getPlayerKey(player) {
  return player.id ?? player.name;
}

function clampInteger(value, min, max) {
  const normalized = Number.isFinite(value) ? Math.floor(value) : min;
  return Math.min(Math.max(normalized, min), max);
}

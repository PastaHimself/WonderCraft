import { ItemStack, system, world } from "@minecraft/server";

const ORE_WASHER_COMPONENT = "wondercraft:ore_washer";
const ORE_WASHER_INPUT = "minecraft:cobblestone";
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
const panelOutputs = new Map();
const hologramEntityIds = new Map();

let stateDirty = false;

system.beforeEvents.startup.subscribe((initEvent) => {
  initEvent.blockComponentRegistry.registerCustomComponent(ORE_WASHER_COMPONENT, {
    onPlayerInteract: (event) => {
      const player = event.player;
      const inventory = player.getComponent("minecraft:inventory");
      const container = inventory?.container;
      if (!container) return;

      const slot = container.getSlot(player.selectedSlotIndex);
      const heldItem = slot.getItem();
      if (!heldItem || heldItem.typeId !== ORE_WASHER_INPUT || heldItem.amount < 1) {
        return;
      }

      heldItem.amount -= 1;
      if (heldItem.amount > 0) {
        slot.setItem(heldItem);
      } else {
        slot.setItem(undefined);
      }

      const outputItem =
        ORE_WASHER_OUTPUTS[Math.floor(Math.random() * ORE_WASHER_OUTPUTS.length)];
      const spawnLocation = centeredAbove(event.block.location, 1);

      player.dimension.spawnItem(new ItemStack(outputItem, 1), spawnLocation);
    },
  });
});

system.run(() => {
  loadEnergyState();
});

system.runInterval(() => {
  refreshEnergySystem();
}, 20);

function refreshEnergySystem() {
  discoverEnergyBlocksNearPlayers();
  pruneTrackedNodes();
  simulateNetworks();
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
    panelOutputs.delete(key);
    hologramEntityIds.delete(key);

    if (node.descriptor.kind === "storage") {
      regulatorCharge.delete(key);
      stateDirty = true;
    }

    if (node.descriptor.kind === "generator") {
      removeHologramForPanel(node);
    }
  }
}

function simulateNetworks() {
  for (const key of panelOutputs.keys()) {
    if (!trackedNodes.has(key)) {
      panelOutputs.delete(key);
    }
  }

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
    panelOutputs.set(generator.key, 0);
  }

  if (generators.length === 0) {
    return;
  }

  if (storages.length === 0) {
    for (const generator of generators) {
      syncPanelHologram(generator, 0);
    }
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
  const acceptedByPanel = allocateAcceptedPower(availableByPanel, acceptedTotal);

  let remaining = acceptedTotal;
  for (const storage of storageBudgets) {
    if (remaining <= 0) {
      break;
    }

    const accepted = Math.min(storage.budget, remaining);
    const current = regulatorCharge.get(storage.node.key) ?? 0;
    regulatorCharge.set(storage.node.key, current + accepted);
    remaining -= accepted;
    stateDirty = true;
  }

  for (const panel of availableByPanel) {
    const accepted = acceptedByPanel.get(panel.key) ?? 0;
    panelOutputs.set(panel.key, accepted);
    syncPanelHologram(panel.node, accepted);
  }
}

function allocateAcceptedPower(availableByPanel, acceptedTotal) {
  const allocations = new Map();

  if (acceptedTotal <= 0) {
    for (const panel of availableByPanel) {
      allocations.set(panel.key, 0);
    }
    return allocations;
  }

  const totalAvailable = availableByPanel.reduce((sum, panel) => sum + panel.watts, 0);
  if (totalAvailable <= 0) {
    for (const panel of availableByPanel) {
      allocations.set(panel.key, 0);
    }
    return allocations;
  }

  let assigned = 0;
  const remainders = [];

  for (const panel of availableByPanel) {
    const exactShare = (acceptedTotal * panel.watts) / totalAvailable;
    const baseShare = Math.min(panel.watts, Math.floor(exactShare));
    allocations.set(panel.key, baseShare);
    assigned += baseShare;
    remainders.push({
      key: panel.key,
      remainder: exactShare - baseShare,
      watts: panel.watts,
    });
  }

  remainders.sort((left, right) => {
    if (right.remainder !== left.remainder) {
      return right.remainder - left.remainder;
    }

    return right.watts - left.watts;
  });

  let remaining = acceptedTotal - assigned;
  while (remaining > 0) {
    let changed = false;

    for (const entry of remainders) {
      if (remaining <= 0) {
        break;
      }

      const current = allocations.get(entry.key) ?? 0;
      const limit = availableByPanel.find((panel) => panel.key === entry.key)?.watts ?? 0;
      if (current >= limit) {
        continue;
      }

      allocations.set(entry.key, current + 1);
      remaining -= 1;
      changed = true;
    }

    if (!changed) {
      break;
    }
  }

  return allocations;
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

function syncPanelHologram(node, watts) {
  const hologram = getOrCreatePanelHologram(node);
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

function getOrCreatePanelHologram(node) {
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

  const hologram = dimension.spawnEntity(HOLOGRAM_TYPE_ID, centeredAbove(node.location, 1.65));
  hologram.addTag(HOLOGRAM_TAG);
  hologram.addTag(specificTag);
  hologram.setProperty("traye:visible", true);
  hologram.setProperty("traye:see_through_walls", false);
  hologramEntityIds.set(node.key, hologram.id);
  return hologram;
}

function removeHologramForPanel(node) {
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
  } catch {
    regulatorCharge.clear();
  }
}

function saveEnergyStateIfDirty() {
  if (!stateDirty) {
    return;
  }

  const serialized = JSON.stringify({
    regulators: Object.fromEntries(regulatorCharge),
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

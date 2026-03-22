
import { ItemStack, system } from "@minecraft/server";

const ORE_WASHER_COMPONENT = "wondercraft:ore_washer";
const INPUT_ITEM = "minecraft:cobblestone";
const RANDOM_DUST_ITEMS = [
  "wondercraft:aluminum_dust",
  "wondercraft:copper_dust",
  "wondercraft:gold_dust",
  "wondercraft:iron_dust",
  "wondercraft:lead_dust",
  "wondercraft:silver_dust",
  "wondercraft:tin_dust",
  "wondercraft:zinc_dust",
];

system.beforeEvents.startup.subscribe((initEvent) => {
  initEvent.blockComponentRegistry.registerCustomComponent(ORE_WASHER_COMPONENT, {
    onPlayerInteract: (event) => {
      const player = event.player;
      const inventory = player.getComponent("minecraft:inventory");
      const container = inventory?.container;
      if (!container) return;

      const slot = container.getSlot(player.selectedSlotIndex);
      const heldItem = slot.getItem();
      if (!heldItem || heldItem.typeId !== INPUT_ITEM || heldItem.amount < 1) {
        return;
      }

      heldItem.amount -= 1;
      if (heldItem.amount > 0) {
        slot.setItem(heldItem);
      } else {
        slot.setItem(undefined);
      }

      const outputItem = RANDOM_DUST_ITEMS[Math.floor(Math.random() * RANDOM_DUST_ITEMS.length)];
      const spawnLocation = {
        x: event.block.location.x + 0.5,
        y: event.block.location.y + 1,
        z: event.block.location.z + 0.5,
      };

      player.dimension.spawnItem(new ItemStack(outputItem, 1), spawnLocation);
    },
  });
});

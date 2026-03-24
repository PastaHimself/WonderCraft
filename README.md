# WonderCraft - Slimefun-Inspired Bedrock Add-on (the addon is st)

WonderCraft is a Minecraft Bedrock add-on inspired by the progression and tech-style gameplay of Slimefun, adapted for Bedrock Edition.


* Ore Washer: opens a Chest-UI machine screen, converts cobblestone into dust through its input/output buffers, and supports hopper automation. Requires 25 W/s from a connected energy regulator.
* Ore Washer controls: click the input slot while holding cobblestone in your selected hotbar slot, click an output slot to collect dust, or place hoppers above and below for automation.
**Solar Panels** (needs recipe)

Basic Solar Panel → 10 W/s
Advanced Solar Panel → 25 W/s
Reinforced Solar Panel → 60 W/s
Industrial Solar Panel → 150 W/s
Elite Solar Panel → 400 W/s
Quantum Solar Panel → 1000 W/s

Energy components
* Energy Regulator: distributes energy to connected systems.
* Energy Connector: transfers energy between blocks.

ITEMS:
========

DUST
-----

* aluminum_dust
* copper_dust
* gold_dust
* iron_dust
* lead_dust
* silver_dust
* tin_dust
* zinc_dust

INGOTS (needs recipe)
------

* aluminum_brass_ingot
* aluminum_bronze_ingot
* aluminum_ingot
* billon_ingot
* brass_ingot
* bronze_ingot
* cobalt_ingot
* copper_ingot
* corinthian_bronze_ingot
* custom_ingot
* damascus_steel_ingot
* durallumin_ingot
* gold_ingot_10k
* gold_ingot_12k
* gold_ingot_14k
* gold_ingot_16k
* gold_ingot_18k
* gold_ingot_20k
* gold_ingot_22k
* gold_ingot_24k
* gold_ingot_4k
* gold_ingot_6k
* gold_ingot_8k
* lead_ingot
* magnesium_ingot
* nickel_ingot
* redstone_alloy_ingot
* reinforced_alloy_ingot
* silver_ingot
* solder_ingot
* steel_ingot
* tin_ingot
* zinc_ingot

Energy Storage Units:
Basic Battery
Recipe: Copper Ingot + Redstone + Iron Ingot
Storage: 512 W
Advanced Battery
Recipe: Basic Battery + Lapis + Gold Ingot
Storage: 2,048 W
Reinforced Battery
Recipe: Advanced Battery + Diamond + Amethyst
Storage: 8,192 W
Industrial Battery
Recipe: Reinforced Battery + Netherite + Emerald
Storage: 32,768 W
Recipe: Industrial Battery + Copper Block + Gold Block
Storage: 131,072 W
Quantum Battery
Recipe: Elite Battery + Nether Star + Amethyst Block
Storage: 1,048,576 W this is my energy implmentation 


# Third-Party Notices

## Chest-UI

- Source: https://github.com/Herobrine643928/Chest-UI
- License: Creative Commons Attribution 4.0 International (CC BY 4.0)
- Used files: `BP/scripts/extensions/*`, `RP/ui/*`, `RP/textures/ui/*`
- Purpose: Chest-style GUI support for the ore washer and related scripted forms
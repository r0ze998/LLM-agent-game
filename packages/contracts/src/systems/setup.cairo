// ============================================================
//  systems/setup.cairo — Register all hardcoded game definitions
//  (25 buildings, 30 techs, 10 units)
// ============================================================

#[starknet::interface]
pub trait ISetup<T> {
    fn register_all(ref self: T);
}

#[dojo::contract]
pub mod setup {
    use dojo::model::ModelStorage;
    use super::ISetup;
    use autonomous_world::models::building::{BuildingDef, BuildingDefEffect};
    use autonomous_world::models::technology::{TechDef, TechDefEffect};
    use autonomous_world::models::military::UnitDef;
    use autonomous_world::types::{EffectType, ResourceType, UnitTag};

    #[abi(embed_v0)]
    impl SetupImpl of ISetup<ContractState> {
        fn register_all(ref self: ContractState) {
            let mut world = self.world(@"aw");
            InternalImpl::register_buildings(ref world);
            InternalImpl::register_techs(ref world);
            InternalImpl::register_units(ref world);
        }
    }

    #[generate_trait]
    impl InternalImpl of InternalTrait {
        // ─────────────────────────────────────────────────────────
        //  Helper: write a BuildingDef + its effects
        // ─────────────────────────────────────────────────────────
        fn write_building(
            ref world: dojo::world::WorldStorage,
            def_id: u32, name_hash: felt252,
            cost_food: u128, cost_wood: u128, cost_stone: u128, cost_iron: u128, cost_gold: u128,
            build_ticks: u32, max_hp: u32, requires_tech_id: u32,
            effects: Span<(EffectType, i128, ResourceType)>,
        ) {
            let ec: u8 = effects.len().try_into().unwrap();
            world.write_model(@BuildingDef {
                def_id, name_hash,
                cost_food, cost_wood, cost_stone, cost_iron, cost_gold,
                build_ticks, max_hp, effect_count: ec,
                requires_tech_id, is_invention: false, invention_id: 0,
            });
            let mut i: u32 = 0;
            while i < effects.len() {
                let (et, val, res) = *effects.at(i);
                world.write_model(@BuildingDefEffect {
                    def_id, effect_index: i.try_into().unwrap(),
                    effect_type: et, value: val, target_resource: res,
                });
                i += 1;
            };
        }

        // ─────────────────────────────────────────────────────────
        //  Helper: write a TechDef + its effects
        // ─────────────────────────────────────────────────────────
        fn write_tech(
            ref world: dojo::world::WorldStorage,
            tech_id: u32, name_hash: felt252,
            research_cost: u128, research_ticks: u32, tier: u8,
            requires_tech_id: u32,
            effects: Span<(EffectType, i128, ResourceType)>,
        ) {
            let ec: u8 = effects.len().try_into().unwrap();
            world.write_model(@TechDef {
                tech_id, name_hash,
                research_cost, research_ticks, tier, requires_tech_id,
                effect_count: ec, is_invention: false, invention_id: 0,
            });
            let mut i: u32 = 0;
            while i < effects.len() {
                let (et, val, res) = *effects.at(i);
                world.write_model(@TechDefEffect {
                    tech_id, effect_index: i.try_into().unwrap(),
                    effect_type: et, value: val, target_resource: res,
                });
                i += 1;
            };
        }

        // ═════════════════════════════════════════════════════════
        //  25 BUILDINGS
        // ═════════════════════════════════════════════════════════
        fn register_buildings(ref world: dojo::world::WorldStorage) {
            // All costs in ×1000 scale. Effects: ×1000 for rates, absolute for capacity.

            // ─── Economy ────────────────────────────────────────
            // 1: Farm
            Self::write_building(ref world, 1, 'farm',
                0, 5000, 0, 0, 0, 3, 100, 0,
                array![(EffectType::ResourceProduction, 3000, ResourceType::Food)].span(),
            );
            // 2: Granary
            Self::write_building(ref world, 2, 'granary',
                0, 15000, 5000, 0, 0, 5, 120, 1, // requires agriculture (tech 1)
                array![
                    (EffectType::ResourceStorage, 200000, ResourceType::Food),
                    (EffectType::FoodConsumptionMod, -100, ResourceType::Food),
                ].span(),
            );
            // 3: Lumber Mill
            Self::write_building(ref world, 3, 'lumber_mill',
                0, 10000, 5000, 0, 0, 4, 100, 0,
                array![(EffectType::ResourceProduction, 2000, ResourceType::Wood)].span(),
            );
            // 4: Mine
            Self::write_building(ref world, 4, 'mine',
                0, 10000, 10000, 0, 0, 5, 120, 11, // requires bronze_working (tech 11)
                array![
                    (EffectType::ResourceProduction, 1000, ResourceType::Stone),
                    (EffectType::ResourceProduction, 1000, ResourceType::Iron),
                ].span(),
            );
            // 5: Market
            Self::write_building(ref world, 5, 'market',
                0, 15000, 15000, 0, 0, 6, 100, 3, // requires animal_husbandry (tech 3)
                array![
                    (EffectType::TradeIncome, 3000, ResourceType::Gold),
                    (EffectType::ResourceProduction, 1000, ResourceType::Gold),
                ].span(),
            );
            // 6: Warehouse
            Self::write_building(ref world, 6, 'warehouse',
                0, 20000, 10000, 0, 0, 5, 150, 0,
                array![
                    (EffectType::ResourceStorage, 150000, ResourceType::Wood),
                    (EffectType::ResourceStorage, 150000, ResourceType::Stone),
                    (EffectType::ResourceStorage, 100000, ResourceType::Iron),
                ].span(),
            );
            // 7: Irrigation Canal
            Self::write_building(ref world, 7, 'irrigation',
                0, 10000, 20000, 0, 0, 6, 80, 2, // requires irrigation (tech 2)
                array![(EffectType::TileYieldMod, 500, ResourceType::Food)].span(),
            );
            // 8: Mint
            Self::write_building(ref world, 8, 'mint',
                0, 0, 20000, 15000, 10000, 8, 120, 17, // requires banking (tech 17)
                array![(EffectType::ResourceProduction, 5000, ResourceType::Gold)].span(),
            );

            // ─── Military ───────────────────────────────────────
            // 9: Barracks
            Self::write_building(ref world, 9, 'barracks',
                0, 15000, 10000, 0, 0, 5, 150, 11, // requires bronze_working
                array![
                    (EffectType::UnlockUnit, 2, ResourceType::Food), // warrior=2
                    (EffectType::UnlockUnit, 4, ResourceType::Food), // spearman=4
                ].span(),
            );
            // 10: Archery Range
            Self::write_building(ref world, 10, 'archery_rng',
                0, 20000, 5000, 0, 0, 5, 120, 12, // requires archery
                array![(EffectType::UnlockUnit, 3, ResourceType::Food)].span(), // archer=3
            );
            // 11: Stable
            Self::write_building(ref world, 11, 'stable',
                0, 20000, 10000, 5000, 0, 6, 130, 13, // requires horseback_riding
                array![(EffectType::UnlockUnit, 5, ResourceType::Food)].span(), // cavalry=5
            );
            // 12: Wall
            Self::write_building(ref world, 12, 'wall',
                0, 0, 20000, 0, 0, 8, 300, 15, // requires fortification (tech 15)
                array![
                    (EffectType::Fortification, 20000, ResourceType::Food),
                    (EffectType::DefenseBonus, 200, ResourceType::Food),
                ].span(),
            );
            // 13: Watchtower
            Self::write_building(ref world, 13, 'watchtower',
                0, 10000, 15000, 0, 0, 4, 80, 0,
                array![
                    (EffectType::VisionRange, 3000, ResourceType::Food),
                    (EffectType::Fortification, 5000, ResourceType::Food),
                ].span(),
            );
            // 14: Forge
            Self::write_building(ref world, 14, 'forge',
                0, 10000, 15000, 10000, 0, 6, 120, 14, // requires iron_working
                array![
                    (EffectType::AttackBonus, 150, ResourceType::Food),
                    (EffectType::DefenseBonus, 100, ResourceType::Food),
                ].span(),
            );
            // 15: Siege Workshop
            Self::write_building(ref world, 15, 'siege_wkshp',
                0, 25000, 0, 15000, 0, 8, 120, 16, // requires siege_warfare
                array![
                    (EffectType::UnlockUnit, 6, ResourceType::Food), // siege_ram=6
                    (EffectType::UnlockUnit, 7, ResourceType::Food), // catapult=7
                ].span(),
            );

            // ─── Culture ────────────────────────────────────────
            // 16: Temple
            Self::write_building(ref world, 16, 'temple',
                0, 10000, 30000, 0, 0, 7, 150, 23, // requires mysticism
                array![
                    (EffectType::CulturePoints, 3000, ResourceType::Food),
                    (EffectType::PopulationGrowth, 50, ResourceType::Food),
                ].span(),
            );
            // 17: Library
            Self::write_building(ref world, 17, 'library',
                0, 20000, 15000, 0, 0, 6, 100, 21, // requires writing
                array![(EffectType::ResearchPoints, 3000, ResourceType::Food)].span(),
            );
            // 18: School
            Self::write_building(ref world, 18, 'school',
                0, 20000, 15000, 0, 0, 6, 100, 24, // requires education
                array![
                    (EffectType::ResearchPoints, 2000, ResourceType::Food),
                    (EffectType::CulturePoints, 1000, ResourceType::Food),
                ].span(),
            );
            // 19: Theater
            Self::write_building(ref world, 19, 'theater',
                0, 25000, 20000, 0, 10000, 8, 120, 25, // requires arts
                array![(EffectType::CulturePoints, 5000, ResourceType::Food)].span(),
            );
            // 20: Monument
            Self::write_building(ref world, 20, 'monument',
                0, 0, 25000, 0, 5000, 10, 200, 0,
                array![(EffectType::CulturePoints, 2000, ResourceType::Food)].span(),
            );
            // 21: Academy
            Self::write_building(ref world, 21, 'academy',
                0, 30000, 25000, 0, 15000, 10, 150, 27, // requires printing
                array![
                    (EffectType::ResearchPoints, 5000, ResourceType::Food),
                    (EffectType::CulturePoints, 2000, ResourceType::Food),
                ].span(),
            );

            // ─── Infrastructure ─────────────────────────────────
            // 22: House
            Self::write_building(ref world, 22, 'house',
                0, 10000, 5000, 0, 0, 3, 80, 0,
                array![(EffectType::Housing, 5000, ResourceType::Food)].span(),
            );
            // 23: Well
            Self::write_building(ref world, 23, 'well',
                0, 0, 8000, 0, 0, 3, 60, 0,
                array![
                    (EffectType::PopulationGrowth, 50, ResourceType::Food),
                    (EffectType::HealPerTick, 1000, ResourceType::Food),
                ].span(),
            );
            // 24: Road
            Self::write_building(ref world, 24, 'road',
                0, 0, 3000, 0, 0, 2, 40, 0,
                array![
                    (EffectType::TradeIncome, 500, ResourceType::Gold),
                    (EffectType::BuildSpeed, 50, ResourceType::Food),
                ].span(),
            );
            // 25: Meeting Hall
            Self::write_building(ref world, 25, 'meeting_hall',
                0, 25000, 20000, 0, 0, 7, 120, 0,
                array![
                    (EffectType::CulturePoints, 1000, ResourceType::Food),
                    (EffectType::PopulationGrowth, 30, ResourceType::Food),
                ].span(),
            );
        }

        // ═════════════════════════════════════════════════════════
        //  30 TECHNOLOGIES (3 branches × 10 tiers)
        // ═════════════════════════════════════════════════════════
        fn register_techs(ref world: dojo::world::WorldStorage) {
            // Tech IDs: Agriculture=1-10, Military=11-20, Culture=21-30
            // research_cost in ×1000, research_ticks = tier*5

            // ─── Agriculture Branch ─────────────────────────────
            // 1: Agriculture (T1)
            Self::write_tech(ref world, 1, 'agriculture', 20000, 5, 1, 0,
                array![(EffectType::TileYieldMod, 250, ResourceType::Food)].span(),
            );
            // 2: Irrigation (T2)
            Self::write_tech(ref world, 2, 'irrigation', 40000, 10, 2, 1,
                array![
                    (EffectType::TileYieldMod, 500, ResourceType::Food),
                    (EffectType::UnlockBuilding, 7, ResourceType::Food), // irrigation_canal
                ].span(),
            );
            // 3: Animal Husbandry (T3)
            Self::write_tech(ref world, 3, 'animal_husb', 60000, 15, 3, 2,
                array![
                    (EffectType::ResourceProduction, 2000, ResourceType::Food),
                    (EffectType::TradeIncome, 1000, ResourceType::Gold),
                ].span(),
            );
            // 4: Crop Rotation (T4)
            Self::write_tech(ref world, 4, 'crop_rot', 90000, 20, 4, 3,
                array![
                    (EffectType::ResourceProduction, 3000, ResourceType::Food),
                    (EffectType::FoodConsumptionMod, -100, ResourceType::Food),
                ].span(),
            );
            // 5: Watermill (T5)
            Self::write_tech(ref world, 5, 'watermill', 130000, 25, 5, 4,
                array![
                    (EffectType::ResourceProduction, 2000, ResourceType::Wood),
                    (EffectType::ResourceProduction, 2000, ResourceType::Food),
                    (EffectType::BuildSpeed, 100, ResourceType::Food),
                ].span(),
            );
            // 6: Guilds (T6)
            Self::write_tech(ref world, 6, 'guilds', 180000, 30, 6, 5,
                array![
                    (EffectType::ResourceProduction, 3000, ResourceType::Gold),
                    (EffectType::TradeIncome, 2000, ResourceType::Gold),
                ].span(),
            );
            // 7: Banking (T7)
            Self::write_tech(ref world, 7, 'banking', 240000, 35, 7, 6,
                array![(EffectType::ResourceProduction, 5000, ResourceType::Gold)].span(),
            );
            // 8: Economics (T8)
            Self::write_tech(ref world, 8, 'economics', 320000, 40, 8, 7,
                array![
                    (EffectType::TradeIncome, 5000, ResourceType::Gold),
                    (EffectType::ResourceStorage, 500000, ResourceType::Gold),
                ].span(),
            );
            // 9: Industrialization (T9)
            Self::write_tech(ref world, 9, 'industrial', 420000, 45, 9, 8,
                array![
                    (EffectType::ResourceProduction, 5000, ResourceType::Iron),
                    (EffectType::BuildSpeed, 300, ResourceType::Food),
                    (EffectType::ResourceProduction, 5000, ResourceType::Gold),
                ].span(),
            );
            // 10: Agriculture Mastery (T10) — Victory condition
            Self::write_tech(ref world, 10, 'agri_master', 550000, 50, 10, 9,
                array![
                    (EffectType::ResourceProduction, 10000, ResourceType::Food),
                    (EffectType::PopulationGrowth, 200, ResourceType::Food),
                    (EffectType::FoodConsumptionMod, -250, ResourceType::Food),
                ].span(),
            );

            // ─── Military Branch ────────────────────────────────
            // 11: Bronze Working (T1)
            Self::write_tech(ref world, 11, 'bronze_work', 20000, 5, 1, 0,
                array![(EffectType::AttackBonus, 100, ResourceType::Food)].span(),
            );
            // 12: Archery (T2)
            Self::write_tech(ref world, 12, 'archery', 40000, 10, 2, 11,
                array![(EffectType::AttackBonus, 150, ResourceType::Food)].span(),
            );
            // 13: Horseback Riding (T3)
            Self::write_tech(ref world, 13, 'horseback', 60000, 15, 3, 12,
                array![(EffectType::AttackBonus, 200, ResourceType::Food)].span(),
            );
            // 14: Iron Working (T4)
            Self::write_tech(ref world, 14, 'iron_work', 90000, 20, 4, 13,
                array![
                    (EffectType::AttackBonus, 150, ResourceType::Food),
                    (EffectType::DefenseBonus, 100, ResourceType::Food),
                ].span(),
            );
            // 15: Fortification (T5)
            Self::write_tech(ref world, 15, 'fortify', 130000, 25, 5, 14,
                array![
                    (EffectType::Fortification, 10000, ResourceType::Food),
                    (EffectType::DefenseBonus, 200, ResourceType::Food),
                ].span(),
            );
            // 16: Siege Warfare (T6)
            Self::write_tech(ref world, 16, 'siege_war', 180000, 30, 6, 15,
                array![(EffectType::AttackBonus, 300, ResourceType::Food)].span(),
            );
            // 17: Steel (T7)
            Self::write_tech(ref world, 17, 'steel', 240000, 35, 7, 16,
                array![
                    (EffectType::AttackBonus, 200, ResourceType::Food),
                    (EffectType::DefenseBonus, 150, ResourceType::Food),
                ].span(),
            );
            // 18: Gunpowder (T8)
            Self::write_tech(ref world, 18, 'gunpowder', 320000, 40, 8, 17,
                array![(EffectType::AttackBonus, 250, ResourceType::Food)].span(),
            );
            // 19: Tactics (T9)
            Self::write_tech(ref world, 19, 'tactics', 420000, 45, 9, 18,
                array![
                    (EffectType::AttackBonus, 200, ResourceType::Food),
                    (EffectType::DefenseBonus, 200, ResourceType::Food),
                    (EffectType::UnitTrainingSpeed, 300, ResourceType::Food),
                ].span(),
            );
            // 20: Military Mastery (T10) — Victory condition
            Self::write_tech(ref world, 20, 'mil_master', 550000, 50, 10, 19,
                array![
                    (EffectType::AttackBonus, 350, ResourceType::Food),
                    (EffectType::DefenseBonus, 300, ResourceType::Food),
                ].span(),
            );

            // ─── Culture Branch ─────────────────────────────────
            // 21: Writing (T1)
            Self::write_tech(ref world, 21, 'writing', 20000, 5, 1, 0,
                array![(EffectType::ResearchPoints, 1000, ResourceType::Food)].span(),
            );
            // 22: Philosophy (T2)
            Self::write_tech(ref world, 22, 'philosophy', 40000, 10, 2, 21,
                array![
                    (EffectType::CulturePoints, 2000, ResourceType::Food),
                    (EffectType::ResearchPoints, 1000, ResourceType::Food),
                ].span(),
            );
            // 23: Mysticism (T3)
            Self::write_tech(ref world, 23, 'mysticism', 60000, 15, 3, 22,
                array![
                    (EffectType::CulturePoints, 2000, ResourceType::Food),
                    (EffectType::PopulationGrowth, 50, ResourceType::Food),
                ].span(),
            );
            // 24: Education (T4)
            Self::write_tech(ref world, 24, 'education', 90000, 20, 4, 23,
                array![(EffectType::ResearchPoints, 3000, ResourceType::Food)].span(),
            );
            // 25: Arts (T5)
            Self::write_tech(ref world, 25, 'arts', 130000, 25, 5, 24,
                array![(EffectType::CulturePoints, 5000, ResourceType::Food)].span(),
            );
            // 26: Theology (T6)
            Self::write_tech(ref world, 26, 'theology', 180000, 30, 6, 25,
                array![
                    (EffectType::CulturePoints, 3000, ResourceType::Food),
                    (EffectType::PopulationGrowth, 100, ResourceType::Food),
                ].span(),
            );
            // 27: Printing (T7)
            Self::write_tech(ref world, 27, 'printing', 240000, 35, 7, 26,
                array![
                    (EffectType::ResearchPoints, 5000, ResourceType::Food),
                    (EffectType::CulturePoints, 3000, ResourceType::Food),
                ].span(),
            );
            // 28: Enlightenment (T8)
            Self::write_tech(ref world, 28, 'enlighten', 320000, 40, 8, 27,
                array![
                    (EffectType::ResearchPoints, 5000, ResourceType::Food),
                    (EffectType::CulturePoints, 5000, ResourceType::Food),
                ].span(),
            );
            // 29: Ideology (T9)
            Self::write_tech(ref world, 29, 'ideology', 420000, 45, 9, 28,
                array![
                    (EffectType::CulturePoints, 8000, ResourceType::Food),
                    (EffectType::PopulationGrowth, 100, ResourceType::Food),
                ].span(),
            );
            // 30: Culture Mastery (T10) — Victory condition
            Self::write_tech(ref world, 30, 'cult_master', 550000, 50, 10, 29,
                array![
                    (EffectType::CulturePoints, 15000, ResourceType::Food),
                    (EffectType::ResearchPoints, 5000, ResourceType::Food),
                ].span(),
            );
        }

        // ═════════════════════════════════════════════════════════
        //  10 UNITS
        // ═════════════════════════════════════════════════════════
        fn register_units(ref world: dojo::world::WorldStorage) {
            // All costs ×1000, upkeep ×1000

            // 1: Militia — no prereqs
            world.write_model(@UnitDef {
                unit_def_id: 1, name_hash: 'militia',
                attack: 3, defense: 2, hp: 30, speed: 2, range: 1,
                cost_food: 10000, cost_wood: 5000, cost_stone: 0, cost_iron: 0, cost_gold: 0,
                upkeep_food: 500, upkeep_gold: 0,
                tag_primary: UnitTag::Melee, tag_secondary: UnitTag::Melee,
                requires_tech_id: 0, requires_building_def_id: 0,
                train_ticks: 3, is_invention: false, invention_id: 0,
            });
            // 2: Warrior
            world.write_model(@UnitDef {
                unit_def_id: 2, name_hash: 'warrior',
                attack: 6, defense: 4, hp: 50, speed: 2, range: 1,
                cost_food: 15000, cost_wood: 0, cost_stone: 0, cost_iron: 5000, cost_gold: 0,
                upkeep_food: 1000, upkeep_gold: 500,
                tag_primary: UnitTag::Melee, tag_secondary: UnitTag::Melee,
                requires_tech_id: 11, requires_building_def_id: 9, // bronze_working + barracks
                train_ticks: 5, is_invention: false, invention_id: 0,
            });
            // 3: Archer
            world.write_model(@UnitDef {
                unit_def_id: 3, name_hash: 'archer',
                attack: 5, defense: 2, hp: 35, speed: 2, range: 3,
                cost_food: 12000, cost_wood: 10000, cost_stone: 0, cost_iron: 0, cost_gold: 0,
                upkeep_food: 800, upkeep_gold: 300,
                tag_primary: UnitTag::Ranged, tag_secondary: UnitTag::Ranged,
                requires_tech_id: 12, requires_building_def_id: 10, // archery + archery_range
                train_ticks: 5, is_invention: false, invention_id: 0,
            });
            // 4: Spearman
            world.write_model(@UnitDef {
                unit_def_id: 4, name_hash: 'spearman',
                attack: 4, defense: 7, hp: 45, speed: 2, range: 1,
                cost_food: 12000, cost_wood: 8000, cost_stone: 0, cost_iron: 0, cost_gold: 0,
                upkeep_food: 800, upkeep_gold: 300,
                tag_primary: UnitTag::Melee, tag_secondary: UnitTag::AntiCavalry,
                requires_tech_id: 11, requires_building_def_id: 9, // bronze_working + barracks
                train_ticks: 4, is_invention: false, invention_id: 0,
            });
            // 5: Cavalry
            world.write_model(@UnitDef {
                unit_def_id: 5, name_hash: 'cavalry',
                attack: 8, defense: 3, hp: 45, speed: 4, range: 1,
                cost_food: 20000, cost_wood: 0, cost_stone: 0, cost_iron: 5000, cost_gold: 5000,
                upkeep_food: 1500, upkeep_gold: 1000,
                tag_primary: UnitTag::Cavalry, tag_secondary: UnitTag::Melee,
                requires_tech_id: 13, requires_building_def_id: 11, // horseback + stable
                train_ticks: 7, is_invention: false, invention_id: 0,
            });
            // 6: Siege Ram
            world.write_model(@UnitDef {
                unit_def_id: 6, name_hash: 'siege_ram',
                attack: 15, defense: 1, hp: 60, speed: 1, range: 1,
                cost_food: 0, cost_wood: 30000, cost_stone: 0, cost_iron: 10000, cost_gold: 0,
                upkeep_food: 1000, upkeep_gold: 1000,
                tag_primary: UnitTag::Siege, tag_secondary: UnitTag::Melee,
                requires_tech_id: 16, requires_building_def_id: 15, // siege_warfare + siege_workshop
                train_ticks: 10, is_invention: false, invention_id: 0,
            });
            // 7: Catapult
            world.write_model(@UnitDef {
                unit_def_id: 7, name_hash: 'catapult',
                attack: 12, defense: 1, hp: 40, speed: 1, range: 5,
                cost_food: 0, cost_wood: 25000, cost_stone: 0, cost_iron: 15000, cost_gold: 5000,
                upkeep_food: 1000, upkeep_gold: 1500,
                tag_primary: UnitTag::Siege, tag_secondary: UnitTag::Ranged,
                requires_tech_id: 16, requires_building_def_id: 15,
                train_ticks: 12, is_invention: false, invention_id: 0,
            });
            // 8: Knight
            world.write_model(@UnitDef {
                unit_def_id: 8, name_hash: 'knight',
                attack: 12, defense: 8, hp: 70, speed: 3, range: 1,
                cost_food: 25000, cost_wood: 0, cost_stone: 0, cost_iron: 15000, cost_gold: 15000,
                upkeep_food: 2000, upkeep_gold: 2000,
                tag_primary: UnitTag::Cavalry, tag_secondary: UnitTag::Melee,
                requires_tech_id: 17, requires_building_def_id: 0, // steel, no building req
                train_ticks: 10, is_invention: false, invention_id: 0,
            });
            // 9: Musketeer
            world.write_model(@UnitDef {
                unit_def_id: 9, name_hash: 'musketeer',
                attack: 14, defense: 5, hp: 45, speed: 2, range: 4,
                cost_food: 20000, cost_wood: 0, cost_stone: 0, cost_iron: 15000, cost_gold: 10000,
                upkeep_food: 1000, upkeep_gold: 1500,
                tag_primary: UnitTag::Ranged, tag_secondary: UnitTag::Ranged,
                requires_tech_id: 18, requires_building_def_id: 0, // gunpowder
                train_ticks: 8, is_invention: false, invention_id: 0,
            });
            // 10: Elite Guard
            world.write_model(@UnitDef {
                unit_def_id: 10, name_hash: 'elite_guard',
                attack: 16, defense: 12, hp: 80, speed: 2, range: 1,
                cost_food: 30000, cost_wood: 0, cost_stone: 0, cost_iron: 20000, cost_gold: 25000,
                upkeep_food: 2000, upkeep_gold: 3000,
                tag_primary: UnitTag::Melee, tag_secondary: UnitTag::Elite,
                requires_tech_id: 20, requires_building_def_id: 0, // military_mastery
                train_ticks: 15, is_invention: false, invention_id: 0,
            });
        }
    }
}

// ============================================================
//  systems/physics.cairo — Layer 0: Immutable physics validation
//  No system may bypass these constraints.
// ============================================================

use autonomous_world::types::EffectType;
use autonomous_world::models::config::PhysicsConfig;

#[starknet::interface]
pub trait IPhysics<T> {
    fn initialize_physics(ref self: T);
}

#[dojo::contract]
pub mod physics {
    use super::{IPhysics, EffectType, PhysicsConfig};
    use dojo::model::ModelStorage;
    use autonomous_world::models::config::{GameConfig, GameCounter};

    #[abi(embed_v0)]
    impl PhysicsImpl of IPhysics<ContractState> {
        /// Initialize physics config singleton. Can only be called once.
        fn initialize_physics(ref self: ContractState) {
            let mut world = self.world(@"aw");
            let game_config: GameConfig = world.read_model(0_u8);
            assert!(!game_config.initialized, "Already initialized");

            // ── Write PhysicsConfig (Layer 0 immutable bounds) ──
            let config = PhysicsConfig {
                config_id: 0_u8,
                // EFFECT_BOUNDS ×1000
                resource_production_min: -10_000,
                resource_production_max:  20_000,
                resource_storage_min: -100_000,
                resource_storage_max:  500_000,
                housing_min:  0,
                housing_max:  50_000,
                research_points_min: -5_000,
                research_points_max:  10_000,
                culture_points_min: -5_000,
                culture_points_max:  10_000,
                tile_yield_mod_min: -500,
                tile_yield_mod_max:  2_000,
                attack_bonus_min: -500,
                attack_bonus_max:  2_000,
                defense_bonus_min: -500,
                defense_bonus_max:  2_000,
                unit_training_speed_min: -500,
                unit_training_speed_max:  1_000,
                build_speed_min: -500,
                build_speed_max:  1_000,
                population_growth_min: -50,
                population_growth_max:  100,
                food_consumption_mod_min: -500,
                food_consumption_mod_max:  1_000,
                trade_income_min: -5_000,
                trade_income_max:  10_000,
                vision_range_min: -3_000,
                vision_range_max:  10_000,
                fortification_min:  0,
                fortification_max:  100_000,
                heal_per_tick_min:  0,
                heal_per_tick_max:  10_000,
                unlock_unit_min:  0,
                unlock_unit_max:  1_000,
                unlock_building_min:  0,
                unlock_building_max:  1_000,
                // Physical constants
                min_building_cost: 1,
                min_research_cost: 5_000,
                min_unit_upkeep_food: 500,
                max_territory_radius: 15,
                min_build_ticks: 1,
                decay_hp_per_tick: 1,
                starvation_pop_loss_rate: 10,
                relevance_decay_rate: 10,
            };
            world.write_model(@config);

            // ── Initialize GameConfig ──
            world.write_model(@GameConfig {
                game_id: 0_u8,
                current_tick: 0,
                tick_interval_seconds: 60,
                max_villages: 100,
                initialized: true,
            });

            // ── Initialize GameCounter ──
            world.write_model(@GameCounter {
                id: 0_u8,
                village_count: 0,
                building_def_count: 100,
                tech_def_count: 100,
                unit_def_count: 100,
            });
        }
    }

    // ── Internal pure functions (callable by other systems) ──

    #[generate_trait]
    pub impl InternalImpl of InternalTrait {
        /// Clamp an effect value to its Layer 0 bounds.
        fn clamp_effect(config: @PhysicsConfig, effect_type: EffectType, value: i128) -> i128 {
            let (lo, hi) = Self::get_bounds(config, effect_type);
            if value < lo {
                lo
            } else if value > hi {
                hi
            } else {
                value
            }
        }

        /// Check if an effect value is within Layer 0 bounds.
        fn validate_effect(
            config: @PhysicsConfig, effect_type: EffectType, value: i128,
        ) -> bool {
            let (lo, hi) = Self::get_bounds(config, effect_type);
            value >= lo && value <= hi
        }

        /// Validate a building definition against physics laws.
        fn validate_building_def(
            config: @PhysicsConfig,
            total_cost: u128,
            build_ticks: u32,
            _effect_count: u32,
        ) -> bool {
            let min_cost: u128 = (*config.min_building_cost).into();
            let min_ticks = *config.min_build_ticks;
            total_cost >= min_cost && build_ticks >= min_ticks
        }

        /// Validate a technology definition against physics laws.
        fn validate_tech_def(config: @PhysicsConfig, research_cost: u128) -> bool {
            research_cost >= *config.min_research_cost
        }

        /// Validate a unit definition against physics laws.
        fn validate_unit_def(config: @PhysicsConfig, food_upkeep: u128) -> bool {
            food_upkeep >= *config.min_unit_upkeep_food
        }

        /// Get (min, max) bounds for a given EffectType.
        fn get_bounds(config: @PhysicsConfig, effect_type: EffectType) -> (i128, i128) {
            match effect_type {
                EffectType::ResourceProduction => (
                    *config.resource_production_min, *config.resource_production_max,
                ),
                EffectType::ResourceStorage => (
                    *config.resource_storage_min, *config.resource_storage_max,
                ),
                EffectType::Housing => (*config.housing_min, *config.housing_max),
                EffectType::ResearchPoints => (
                    *config.research_points_min, *config.research_points_max,
                ),
                EffectType::CulturePoints => (
                    *config.culture_points_min, *config.culture_points_max,
                ),
                EffectType::TileYieldMod => (
                    *config.tile_yield_mod_min, *config.tile_yield_mod_max,
                ),
                EffectType::AttackBonus => (*config.attack_bonus_min, *config.attack_bonus_max),
                EffectType::DefenseBonus => (
                    *config.defense_bonus_min, *config.defense_bonus_max,
                ),
                EffectType::UnitTrainingSpeed => (
                    *config.unit_training_speed_min, *config.unit_training_speed_max,
                ),
                EffectType::BuildSpeed => (*config.build_speed_min, *config.build_speed_max),
                EffectType::PopulationGrowth => (
                    *config.population_growth_min, *config.population_growth_max,
                ),
                EffectType::FoodConsumptionMod => (
                    *config.food_consumption_mod_min, *config.food_consumption_mod_max,
                ),
                EffectType::TradeIncome => (*config.trade_income_min, *config.trade_income_max),
                EffectType::VisionRange => (*config.vision_range_min, *config.vision_range_max),
                EffectType::Fortification => (
                    *config.fortification_min, *config.fortification_max,
                ),
                EffectType::HealPerTick => (
                    *config.heal_per_tick_min, *config.heal_per_tick_max,
                ),
                EffectType::UnlockUnit => (*config.unlock_unit_min, *config.unlock_unit_max),
                EffectType::UnlockBuilding => (
                    *config.unlock_building_min, *config.unlock_building_max,
                ),
            }
        }
    }
}

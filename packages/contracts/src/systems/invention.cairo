// ============================================================
//  systems/invention.cairo — Layer 2: Invention system
// ============================================================

use autonomous_world::types::{EffectType, InventionType};

#[starknet::interface]
pub trait IInventionSys<T> {
    fn register(
        ref self: T,
        village_id: u32,
        invention_type: InventionType,
        name_hash: felt252,
        total_cost: u128,
        effect_types: Span<EffectType>,
        effect_values: Span<i128>,
    );
    fn spread_knowledge(ref self: T, invention_id: u32, target_village_id: u32);
    fn decay_invention(ref self: T, invention_id: u32);
}

#[dojo::contract]
pub mod invention_sys {
    use starknet::{ContractAddress, get_caller_address};
    use dojo::model::ModelStorage;
    use dojo::event::EventStorage;
    use super::{IInventionSys, EffectType, InventionType};
    use autonomous_world::models::invention::{
        Invention, InventionEffect, InventionKnowledge, InventionCounter, VillageInventionCount,
    };
    use autonomous_world::models::village::Village;
    use autonomous_world::models::config::{PhysicsConfig, GameConfig};
    use autonomous_world::systems::physics::physics::InternalImpl as PhysicsInternal;

    const MAX_EFFECTS_PER_INVENTION: u32 = 8;
    const MAX_INVENTIONS_PER_VILLAGE: u32 = 20;
    const SPREAD_DELAY_TICKS: u64 = 50;
    const REQUIRED_RESEARCH_POINTS: u128 = 100_000;

    #[dojo::event]
    #[derive(Drop, Serde)]
    struct InventionRegistered {
        #[key]
        invention_id: u32,
        origin_village_id: u32,
        invention_type: InventionType,
        tick: u64,
    }

    #[dojo::event]
    #[derive(Drop, Serde)]
    struct KnowledgeSpread {
        #[key]
        invention_id: u32,
        #[key]
        target_village_id: u32,
        tick: u64,
    }

    #[abi(embed_v0)]
    impl InventionSysImpl of IInventionSys<ContractState> {
        fn register(
            ref self: ContractState,
            village_id: u32,
            invention_type: InventionType,
            name_hash: felt252,
            total_cost: u128,
            effect_types: Span<EffectType>,
            effect_values: Span<i128>,
        ) {
            let mut world = self.world(@"aw");
            let caller = get_caller_address();
            let village: Village = world.read_model(village_id);
            let zero: ContractAddress = starknet::contract_address_const::<0>();
            if village.owner != zero {
                assert!(village.owner == caller, "Not village owner");
            }

            let effect_count = effect_types.len();
            assert!(effect_count > 0, "No effects");
            assert!(effect_count <= MAX_EFFECTS_PER_INVENTION, "Too many effects");
            assert!(effect_count == effect_values.len(), "Effect count mismatch");

            let vic: VillageInventionCount = world.read_model(village_id);
            assert!(vic.count < MAX_INVENTIONS_PER_VILLAGE, "Too many inventions");
            assert!(village.research_points >= REQUIRED_RESEARCH_POINTS, "Not enough RP");

            let config: PhysicsConfig = world.read_model(0_u8);
            let game_config: GameConfig = world.read_model(0_u8);

            match invention_type {
                InventionType::Building => {
                    assert!(
                        PhysicsInternal::validate_building_def(@config, total_cost, 1, effect_count),
                        "Invalid building def",
                    );
                },
                InventionType::Tech => {
                    assert!(PhysicsInternal::validate_tech_def(@config, total_cost), "Invalid tech def");
                },
                InventionType::Unit => {
                    assert!(PhysicsInternal::validate_unit_def(@config, total_cost), "Invalid unit def");
                },
            }

            let mut i: u32 = 0;
            while i < effect_count {
                assert!(
                    PhysicsInternal::validate_effect(@config, *effect_types.at(i), *effect_values.at(i)),
                    "Effect violates physics",
                );
                i += 1;
            };

            let mut counter: InventionCounter = world.read_model(0_u8);
            counter.count += 1;
            let invention_id = counter.count;
            world.write_model(@counter);

            world.write_model(@Invention {
                invention_id, invention_type, inventor_address: caller,
                origin_village_id: village_id, name_hash,
                invented_at_tick: game_config.current_tick,
                relevance: 1000, effect_count: effect_count.try_into().unwrap(), total_cost,
            });

            i = 0;
            while i < effect_count {
                world.write_model(@InventionEffect {
                    invention_id,
                    effect_index: i.try_into().unwrap(),
                    effect_type: *effect_types.at(i),
                    value: *effect_values.at(i),
                });
                i += 1;
            };

            world.write_model(@InventionKnowledge { invention_id, village_id, known: true });
            world.write_model(@VillageInventionCount { village_id, count: vic.count + 1 });

            world.emit_event(@InventionRegistered {
                invention_id, origin_village_id: village_id, invention_type,
                tick: game_config.current_tick,
            });
        }

        fn spread_knowledge(ref self: ContractState, invention_id: u32, target_village_id: u32) {
            let mut world = self.world(@"aw");
            let invention: Invention = world.read_model(invention_id);
            assert!(invention.relevance > 0, "Invention has no relevance");

            let game_config: GameConfig = world.read_model(0_u8);
            assert!(
                game_config.current_tick >= invention.invented_at_tick + SPREAD_DELAY_TICKS,
                "Too early to spread",
            );

            let existing: InventionKnowledge = world.read_model((invention_id, target_village_id));
            assert!(!existing.known, "Already known");

            let target: Village = world.read_model(target_village_id);
            assert!(target.population > 0, "Target village does not exist");

            world.write_model(@InventionKnowledge {
                invention_id, village_id: target_village_id, known: true,
            });

            world.emit_event(@KnowledgeSpread {
                invention_id, target_village_id, tick: game_config.current_tick,
            });
        }

        fn decay_invention(ref self: ContractState, invention_id: u32) {
            let mut world = self.world(@"aw");
            let config: PhysicsConfig = world.read_model(0_u8);
            let mut invention: Invention = world.read_model(invention_id);
            if invention.relevance == 0 { return; }

            let decay = config.relevance_decay_rate;
            if invention.relevance > decay {
                invention.relevance -= decay;
            } else {
                invention.relevance = 0;
            }
            world.write_model(@invention);
        }
    }
}

// ============================================================
//  systems/village_tick.cairo — Lazy evaluation tick processor
// ============================================================

use autonomous_world::types::{EffectType, ResourceType};
use starknet::ContractAddress;

#[starknet::interface]
pub trait IVillageTick<T> {
    fn tick(ref self: T, village_id: u32);
    fn create_village(ref self: T, owner: ContractAddress) -> u32;
}

#[dojo::contract]
pub mod village_tick {
    use starknet::ContractAddress;
    use dojo::model::ModelStorage;
    use dojo::event::EventStorage;
    use super::{IVillageTick, EffectType, ResourceType};
    use autonomous_world::models::village::Village;
    use autonomous_world::models::building::{
        Building, BuildingDef, BuildingDefEffect, BuildQueue, BuildingCounter, BuildQueueCounter,
    };
    use autonomous_world::models::technology::{ResearchedTech, TechDef, TechDefEffect, ResearchQueue};
    use autonomous_world::models::military::{GarrisonUnit, TrainQueue, TrainQueueCounter};
    use autonomous_world::models::config::{PhysicsConfig, GameConfig, GameCounter};
    use autonomous_world::systems::physics::physics::InternalImpl as PhysicsInternal;

    const FOOD_PER_POP_PER_TICK: u128 = 500;
    const POP_GROWTH_BASE_RATE: u128 = 20;
    const POP_STARVATION_RATE: u128 = 50;
    const BASE_HOUSING_CAPACITY: u32 = 10;
    const POP_RESEARCH_CONTRIBUTION: u128 = 100;
    const BASE_STORAGE: u128 = 500_000;

    #[dojo::event]
    #[derive(Drop, Serde)]
    struct VillageTicked {
        #[key]
        village_id: u32,
        tick: u64,
        food_delta: i128,
        population_delta: i32,
    }

    #[abi(embed_v0)]
    impl VillageTickImpl of IVillageTick<ContractState> {
        fn tick(ref self: ContractState, village_id: u32) {
            let mut world = self.world(@"aw");

            let game_config: GameConfig = world.read_model(0_u8);
            assert!(game_config.initialized, "Game not initialized");

            let mut village: Village = world.read_model(village_id);
            assert!(village.founded_at_tick > 0 || village.population > 0, "Village does not exist");

            let current_tick = game_config.current_tick;
            if current_tick <= village.last_tick {
                return;
            }
            let elapsed: u128 = (current_tick - village.last_tick).into();
            let elapsed_i: i128 = elapsed.try_into().unwrap();

            let config: PhysicsConfig = world.read_model(0_u8);

            // ── 1. Aggregate building effects ──
            let mut total_food_prod: i128 = 0;
            let mut total_wood_prod: i128 = 0;
            let mut total_stone_prod: i128 = 0;
            let mut total_iron_prod: i128 = 0;
            let mut total_gold_prod: i128 = 0;
            let mut total_housing: i128 = 0;
            let mut total_research: i128 = 0;
            let mut total_culture: i128 = 0;
            let mut total_food_consumption_mod: i128 = 0;
            let mut total_pop_growth_mod: i128 = 0;
            let mut total_storage_food: i128 = 0;
            let mut total_storage_wood: i128 = 0;
            let mut total_storage_stone: i128 = 0;
            let mut total_storage_iron: i128 = 0;
            let mut total_storage_gold: i128 = 0;

            let building_counter: BuildingCounter = world.read_model(village_id);
            let mut b: u32 = 0;
            while b < building_counter.count {
                let building: Building = world.read_model((village_id, b));
                if building.active {
                    let bdef: BuildingDef = world.read_model(building.def_id);
                    let mut e: u8 = 0;
                    while e < bdef.effect_count {
                        let eff: BuildingDefEffect = world.read_model((building.def_id, e));
                        let clamped = PhysicsInternal::clamp_effect(
                            @config, eff.effect_type, eff.value,
                        );
                        InternalImpl::accumulate_effect(
                            ref total_food_prod, ref total_wood_prod,
                            ref total_stone_prod, ref total_iron_prod,
                            ref total_gold_prod, ref total_housing,
                            ref total_research, ref total_culture,
                            ref total_food_consumption_mod, ref total_pop_growth_mod,
                            ref total_storage_food, ref total_storage_wood,
                            ref total_storage_stone, ref total_storage_iron,
                            ref total_storage_gold,
                            eff.effect_type, eff.target_resource, clamped,
                        );
                        e += 1;
                    };
                }
                b += 1;
            };

            // ── 2. Aggregate researched tech effects ──
            let mut t: u32 = 0;
            while t < 100 {
                let rtech: ResearchedTech = world.read_model((village_id, t));
                if rtech.researched_at_tick > 0 {
                    let tdef: TechDef = world.read_model(t);
                    let mut e: u8 = 0;
                    while e < tdef.effect_count {
                        let eff: TechDefEffect = world.read_model((t, e));
                        let clamped = PhysicsInternal::clamp_effect(
                            @config, eff.effect_type, eff.value,
                        );
                        InternalImpl::accumulate_effect(
                            ref total_food_prod, ref total_wood_prod,
                            ref total_stone_prod, ref total_iron_prod,
                            ref total_gold_prod, ref total_housing,
                            ref total_research, ref total_culture,
                            ref total_food_consumption_mod, ref total_pop_growth_mod,
                            ref total_storage_food, ref total_storage_wood,
                            ref total_storage_stone, ref total_storage_iron,
                            ref total_storage_gold,
                            eff.effect_type, eff.target_resource, clamped,
                        );
                        e += 1;
                    };
                }
                t += 1;
            };

            // ── 3. Apply resource production / consumption ──
            let pop: u128 = village.population.into();
            let base_food_consumption: i128 = (pop * FOOD_PER_POP_PER_TICK).try_into().unwrap();
            let food_mod_adjusted = base_food_consumption
                + (base_food_consumption * total_food_consumption_mod / 1000);
            let net_food: i128 = total_food_prod * elapsed_i - food_mod_adjusted * elapsed_i;

            let storage_food = InternalImpl::u128_max(
                BASE_STORAGE, InternalImpl::safe_add_u128(BASE_STORAGE, total_storage_food),
            );
            let storage_wood = InternalImpl::u128_max(
                BASE_STORAGE, InternalImpl::safe_add_u128(BASE_STORAGE, total_storage_wood),
            );
            let storage_stone = InternalImpl::u128_max(
                BASE_STORAGE, InternalImpl::safe_add_u128(BASE_STORAGE, total_storage_stone),
            );
            let storage_iron = InternalImpl::u128_max(
                BASE_STORAGE, InternalImpl::safe_add_u128(BASE_STORAGE, total_storage_iron),
            );
            let storage_gold = InternalImpl::u128_max(
                BASE_STORAGE, InternalImpl::safe_add_u128(BASE_STORAGE, total_storage_gold),
            );

            village.food = InternalImpl::apply_delta_clamped(village.food, net_food, storage_food);
            village.wood = InternalImpl::apply_delta_clamped(
                village.wood, total_wood_prod * elapsed_i, storage_wood,
            );
            village.stone = InternalImpl::apply_delta_clamped(
                village.stone, total_stone_prod * elapsed_i, storage_stone,
            );
            village.iron = InternalImpl::apply_delta_clamped(
                village.iron, total_iron_prod * elapsed_i, storage_iron,
            );
            village.gold = InternalImpl::apply_delta_clamped(
                village.gold, total_gold_prod * elapsed_i, storage_gold,
            );
            village.storage_food = storage_food;
            village.storage_wood = storage_wood;
            village.storage_stone = storage_stone;
            village.storage_iron = storage_iron;
            village.storage_gold = storage_gold;

            // ── 4. Population ──
            let housing: u32 = BASE_HOUSING_CAPACITY
                + InternalImpl::i128_to_u32_clamped(total_housing);
            village.housing_capacity = housing;

            let mut pop_delta: i32 = 0;
            let is_starving = village.food == 0 && net_food < 0;
            if is_starving {
                let loss = pop * POP_STARVATION_RATE / 1000;
                let loss_per_elapsed = loss * elapsed;
                let actual_loss = if loss_per_elapsed == 0 && elapsed > 0 {
                    1_u128
                } else {
                    loss_per_elapsed
                };
                let loss32: u32 = if actual_loss > 0xFFFFFFFF_u128 {
                    0xFFFFFFFF_u32
                } else {
                    actual_loss.try_into().unwrap()
                };
                if village.population > loss32 {
                    village.population -= loss32;
                } else {
                    village.population = 1;
                }
                pop_delta = -(loss32.try_into().unwrap());
            } else if village.population < housing {
                let growth_rate: u128 = POP_GROWTH_BASE_RATE
                    + InternalImpl::i128_to_u128_clamped(total_pop_growth_mod);
                let growth = pop * growth_rate * elapsed / 1000;
                let growth32: u32 = if growth > 0xFFFFFFFF_u128 {
                    0xFFFFFFFF_u32
                } else if growth == 0 && elapsed > 0 {
                    1_u32
                } else {
                    growth.try_into().unwrap()
                };
                let new_pop = village.population + growth32;
                village.population = if new_pop > housing { housing } else { new_pop };
                pop_delta = growth32.try_into().unwrap();
            }

            // ── 5. Research points ──
            let base_rp: u128 = pop * POP_RESEARCH_CONTRIBUTION;
            let rp_gain: i128 = (base_rp * elapsed).try_into().unwrap()
                + total_research * elapsed_i;
            village.research_points = InternalImpl::apply_delta_clamped(
                village.research_points, rp_gain, 0xFFFFFFFFFFFFFFFF_u128,
            );

            // ── 6. Culture points ──
            let culture_gain: i128 = total_culture * elapsed_i;
            village.culture_points = InternalImpl::apply_delta_clamped(
                village.culture_points, culture_gain, 0xFFFFFFFFFFFFFFFF_u128,
            );
            village.total_culture_points = InternalImpl::apply_delta_clamped(
                village.total_culture_points, culture_gain, 0xFFFFFFFFFFFFFFFF_u128,
            );

            // ── 7. Process build queue ──
            let bq_counter: BuildQueueCounter = world.read_model(village_id);
            let mut qi: u8 = 0;
            while qi < bq_counter.count {
                let mut bq: BuildQueue = world.read_model((village_id, qi));
                if bq.active && current_tick >= bq.completes_at_tick {
                    let mut bc: BuildingCounter = world.read_model(village_id);
                    let new_id = bc.count;
                    let bdef: BuildingDef = world.read_model(bq.def_id);
                    world.write_model(@Building {
                        village_id,
                        building_id: new_id,
                        def_id: bq.def_id,
                        pos_x: bq.pos_x,
                        pos_y: bq.pos_y,
                        hp: bdef.max_hp,
                        max_hp: bdef.max_hp,
                        built_at_tick: current_tick,
                        active: true,
                    });
                    bc.count += 1;
                    world.write_model(@bc);
                    bq.active = false;
                    world.write_model(@bq);
                }
                qi += 1;
            };

            // ── 8. Process research queue ──
            let rq: ResearchQueue = world.read_model(village_id);
            if rq.active && current_tick >= rq.completes_at_tick {
                world.write_model(@ResearchedTech {
                    village_id, tech_id: rq.tech_id, researched_at_tick: current_tick,
                });
                world.write_model(@ResearchQueue {
                    village_id, tech_id: 0, started_at_tick: 0,
                    completes_at_tick: 0, active: false,
                });
            }

            // ── 9. Process train queue ──
            let tq_counter: TrainQueueCounter = world.read_model(village_id);
            let mut ti: u8 = 0;
            while ti < tq_counter.count {
                let mut tq: TrainQueue = world.read_model((village_id, ti));
                if tq.active && current_tick >= tq.completes_at_tick {
                    let mut garrison: GarrisonUnit = world.read_model(
                        (village_id, tq.unit_def_id),
                    );
                    garrison.count += tq.count;
                    garrison.village_id = village_id;
                    garrison.unit_def_id = tq.unit_def_id;
                    world.write_model(@garrison);
                    tq.active = false;
                    world.write_model(@tq);
                }
                ti += 1;
            };

            // ── 10. Update score ──
            village.score = InternalImpl::compute_score(@village);
            village.last_tick = current_tick;
            world.write_model(@village);

            world.emit_event(@VillageTicked {
                village_id, tick: current_tick, food_delta: net_food, population_delta: pop_delta,
            });
        }

        fn create_village(ref self: ContractState, owner: ContractAddress) -> u32 {
            let mut world = self.world(@"aw");

            let game_config: GameConfig = world.read_model(0_u8);
            assert!(game_config.initialized, "Game not initialized");

            let mut counter: GameCounter = world.read_model(0_u8);
            counter.village_count += 1;
            let vid = counter.village_count;
            world.write_model(@counter);

            world.write_model(@Village {
                village_id: vid,
                owner,
                food: 100_000,
                wood: 50_000,
                stone: 30_000,
                iron: 0,
                gold: 0,
                storage_food: BASE_STORAGE,
                storage_wood: BASE_STORAGE,
                storage_stone: BASE_STORAGE,
                storage_iron: BASE_STORAGE,
                storage_gold: BASE_STORAGE,
                population: 10,
                housing_capacity: BASE_HOUSING_CAPACITY,
                research_points: 0,
                culture_points: 0,
                total_culture_points: 0,
                score: 0,
                founded_at_tick: game_config.current_tick,
                last_tick: game_config.current_tick,
            });
            vid
        }
    }

    #[generate_trait]
    impl InternalImpl of InternalTrait {
        fn accumulate_effect(
            ref food_prod: i128, ref wood_prod: i128,
            ref stone_prod: i128, ref iron_prod: i128,
            ref gold_prod: i128, ref housing: i128,
            ref research: i128, ref culture: i128,
            ref food_consumption_mod: i128, ref pop_growth_mod: i128,
            ref storage_food: i128, ref storage_wood: i128,
            ref storage_stone: i128, ref storage_iron: i128,
            ref storage_gold: i128,
            effect_type: EffectType, target_resource: ResourceType, value: i128,
        ) {
            match effect_type {
                EffectType::ResourceProduction => {
                    match target_resource {
                        ResourceType::Food => { food_prod += value; },
                        ResourceType::Wood => { wood_prod += value; },
                        ResourceType::Stone => { stone_prod += value; },
                        ResourceType::Iron => { iron_prod += value; },
                        ResourceType::Gold => { gold_prod += value; },
                    }
                },
                EffectType::ResourceStorage => {
                    match target_resource {
                        ResourceType::Food => { storage_food += value; },
                        ResourceType::Wood => { storage_wood += value; },
                        ResourceType::Stone => { storage_stone += value; },
                        ResourceType::Iron => { storage_iron += value; },
                        ResourceType::Gold => { storage_gold += value; },
                    }
                },
                EffectType::Housing => { housing += value; },
                EffectType::ResearchPoints => { research += value; },
                EffectType::CulturePoints => { culture += value; },
                EffectType::PopulationGrowth => { pop_growth_mod += value; },
                EffectType::FoodConsumptionMod => { food_consumption_mod += value; },
                _ => {},
            }
        }

        fn apply_delta_clamped(current: u128, delta: i128, max: u128) -> u128 {
            if delta >= 0 {
                let d: u128 = delta.try_into().unwrap();
                let sum = current + d;
                if sum > max { max } else { sum }
            } else {
                let abs_d: u128 = (-delta).try_into().unwrap();
                if abs_d >= current { 0 } else { current - abs_d }
            }
        }

        fn safe_add_u128(base: u128, delta: i128) -> u128 {
            if delta >= 0 {
                base + delta.try_into().unwrap()
            } else {
                let abs_d: u128 = (-delta).try_into().unwrap();
                if abs_d >= base { 0 } else { base - abs_d }
            }
        }

        fn u128_max(a: u128, b: u128) -> u128 {
            if a > b { a } else { b }
        }

        fn i128_to_u32_clamped(v: i128) -> u32 {
            if v <= 0 {
                0
            } else if v > 0xFFFFFFFF {
                0xFFFFFFFF_u32
            } else {
                let u: u128 = v.try_into().unwrap();
                u.try_into().unwrap()
            }
        }

        fn i128_to_u128_clamped(v: i128) -> u128 {
            if v <= 0 { 0 } else { v.try_into().unwrap() }
        }

        fn compute_score(village: @Village) -> u32 {
            let pop: u32 = *village.population;
            let culture: u32 = (*village.total_culture_points / 1000).try_into().unwrap();
            let rp: u32 = (*village.research_points / 1000).try_into().unwrap();
            pop + culture + rp
        }
    }
}

// ============================================================
//  systems/commands.cairo — Player commands
// ============================================================

use autonomous_world::types::DiplomacyStatus;

#[starknet::interface]
pub trait ICommands<T> {
    fn build(ref self: T, village_id: u32, building_def_id: u32, pos_x: u32, pos_y: u32);
    fn research(ref self: T, village_id: u32, tech_id: u32);
    fn train(ref self: T, village_id: u32, unit_def_id: u32, count: u32);
    fn demolish(ref self: T, village_id: u32, building_id: u32);
    fn set_diplomacy(ref self: T, village_id: u32, target_id: u32, status: DiplomacyStatus);
    fn advance_tick(ref self: T);
}

#[dojo::contract]
pub mod commands {
    use starknet::{ContractAddress, get_caller_address};
    use dojo::model::ModelStorage;
    use super::{ICommands, DiplomacyStatus};
    use autonomous_world::models::village::Village;
    use autonomous_world::models::building::{
        BuildingDef, BuildQueue, BuildQueueCounter, Building, BuildingCounter,
    };
    use autonomous_world::models::technology::{TechDef, ResearchQueue, ResearchedTech};
    use autonomous_world::models::military::{UnitDef, TrainQueue, TrainQueueCounter};
    use autonomous_world::models::diplomacy::DiplomaticRelation;
    use autonomous_world::models::covenant::{Covenant, CovenantClause, CovenantCounter};
    use autonomous_world::models::config::GameConfig;
    use autonomous_world::types::ClauseType;

    #[abi(embed_v0)]
    impl CommandsImpl of ICommands<ContractState> {
        fn build(
            ref self: ContractState,
            village_id: u32,
            building_def_id: u32,
            pos_x: u32,
            pos_y: u32,
        ) {
            let mut world = self.world(@"aw");
            let caller = get_caller_address();
            let village: Village = world.read_model(village_id);
            InternalImpl::assert_owner(village.owner, caller);

            let bdef: BuildingDef = world.read_model(building_def_id);
            assert!(bdef.max_hp > 0, "BuildingDef not found");

            if bdef.requires_tech_id > 0 {
                let rtech: ResearchedTech = world.read_model((village_id, bdef.requires_tech_id));
                assert!(rtech.researched_at_tick > 0, "Missing prerequisite tech");
            }

            // ── Check building_ban from active covenants ──
            InternalImpl::assert_not_banned(ref world, village_id, building_def_id);

            let mut v = village;
            assert!(v.food >= bdef.cost_food, "Not enough food");
            assert!(v.wood >= bdef.cost_wood, "Not enough wood");
            assert!(v.stone >= bdef.cost_stone, "Not enough stone");
            assert!(v.iron >= bdef.cost_iron, "Not enough iron");
            assert!(v.gold >= bdef.cost_gold, "Not enough gold");
            v.food -= bdef.cost_food;
            v.wood -= bdef.cost_wood;
            v.stone -= bdef.cost_stone;
            v.iron -= bdef.cost_iron;
            v.gold -= bdef.cost_gold;
            world.write_model(@v);

            let game_config: GameConfig = world.read_model(0_u8);
            let mut bq_counter: BuildQueueCounter = world.read_model(village_id);
            let qi = bq_counter.count;
            world.write_model(@BuildQueue {
                village_id,
                queue_index: qi,
                def_id: building_def_id,
                pos_x,
                pos_y,
                started_at_tick: game_config.current_tick,
                completes_at_tick: game_config.current_tick + bdef.build_ticks.into(),
                active: true,
            });
            bq_counter.count = qi + 1;
            world.write_model(@bq_counter);
        }

        fn research(ref self: ContractState, village_id: u32, tech_id: u32) {
            let mut world = self.world(@"aw");
            let caller = get_caller_address();
            let village: Village = world.read_model(village_id);
            InternalImpl::assert_owner(village.owner, caller);

            let tdef: TechDef = world.read_model(tech_id);
            assert!(tdef.research_cost > 0, "TechDef not found");

            let existing: ResearchedTech = world.read_model((village_id, tech_id));
            assert!(existing.researched_at_tick == 0, "Already researched");

            if tdef.requires_tech_id > 0 {
                let prereq: ResearchedTech = world.read_model((village_id, tdef.requires_tech_id));
                assert!(prereq.researched_at_tick > 0, "Missing prerequisite tech");
            }

            let current_rq: ResearchQueue = world.read_model(village_id);
            assert!(!current_rq.active, "Research queue busy");

            let mut v = village;
            assert!(v.research_points >= tdef.research_cost, "Not enough RP");
            v.research_points -= tdef.research_cost;
            world.write_model(@v);

            let game_config: GameConfig = world.read_model(0_u8);
            world.write_model(@ResearchQueue {
                village_id,
                tech_id,
                started_at_tick: game_config.current_tick,
                completes_at_tick: game_config.current_tick + tdef.research_ticks.into(),
                active: true,
            });
        }

        fn train(ref self: ContractState, village_id: u32, unit_def_id: u32, count: u32) {
            let mut world = self.world(@"aw");
            let caller = get_caller_address();
            let village: Village = world.read_model(village_id);
            InternalImpl::assert_owner(village.owner, caller);

            let udef: UnitDef = world.read_model(unit_def_id);
            assert!(udef.hp > 0, "UnitDef not found");

            if udef.requires_tech_id > 0 {
                let rtech: ResearchedTech = world.read_model((village_id, udef.requires_tech_id));
                assert!(rtech.researched_at_tick > 0, "Missing prerequisite tech");
            }
            if udef.requires_building_def_id > 0 {
                let bc: BuildingCounter = world.read_model(village_id);
                let mut found = false;
                let mut i: u32 = 0;
                while i < bc.count {
                    let bld: Building = world.read_model((village_id, i));
                    if bld.active && bld.def_id == udef.requires_building_def_id {
                        found = true;
                        break;
                    }
                    i += 1;
                };
                assert!(found, "Missing prerequisite building");
            }

            let cnt: u128 = count.into();
            let mut v = village;
            assert!(v.food >= udef.cost_food * cnt, "Not enough food");
            assert!(v.wood >= udef.cost_wood * cnt, "Not enough wood");
            assert!(v.stone >= udef.cost_stone * cnt, "Not enough stone");
            assert!(v.iron >= udef.cost_iron * cnt, "Not enough iron");
            assert!(v.gold >= udef.cost_gold * cnt, "Not enough gold");
            v.food -= udef.cost_food * cnt;
            v.wood -= udef.cost_wood * cnt;
            v.stone -= udef.cost_stone * cnt;
            v.iron -= udef.cost_iron * cnt;
            v.gold -= udef.cost_gold * cnt;
            world.write_model(@v);

            let game_config: GameConfig = world.read_model(0_u8);
            let mut tq_counter: TrainQueueCounter = world.read_model(village_id);
            let qi = tq_counter.count;
            world.write_model(@TrainQueue {
                village_id,
                queue_index: qi,
                unit_def_id,
                count,
                started_at_tick: game_config.current_tick,
                completes_at_tick: game_config.current_tick + udef.train_ticks.into(),
                active: true,
            });
            tq_counter.count = qi + 1;
            world.write_model(@tq_counter);
        }

        fn demolish(ref self: ContractState, village_id: u32, building_id: u32) {
            let mut world = self.world(@"aw");
            let caller = get_caller_address();
            let village: Village = world.read_model(village_id);
            InternalImpl::assert_owner(village.owner, caller);

            let mut building: Building = world.read_model((village_id, building_id));
            assert!(building.active, "Building not active");
            building.active = false;
            building.hp = 0;
            world.write_model(@building);
        }

        fn set_diplomacy(
            ref self: ContractState, village_id: u32, target_id: u32, status: DiplomacyStatus,
        ) {
            let mut world = self.world(@"aw");
            let caller = get_caller_address();
            let village: Village = world.read_model(village_id);
            InternalImpl::assert_owner(village.owner, caller);
            assert!(village_id != target_id, "Cannot self-diplomacy");

            let game_config: GameConfig = world.read_model(0_u8);
            let (a, b) = if village_id < target_id {
                (village_id, target_id)
            } else {
                (target_id, village_id)
            };

            world.write_model(@DiplomaticRelation {
                village_a: a, village_b: b, status, updated_at_tick: game_config.current_tick,
            });
        }

        fn advance_tick(ref self: ContractState) {
            let mut world = self.world(@"aw");
            let mut game_config: GameConfig = world.read_model(0_u8);
            assert!(game_config.initialized, "Game not initialized");
            game_config.current_tick += 1;
            world.write_model(@game_config);
        }
    }

    #[generate_trait]
    impl InternalImpl of InternalTrait {
        fn assert_owner(owner: ContractAddress, caller: ContractAddress) {
            let zero: ContractAddress = starknet::contract_address_const::<0>();
            if owner != zero {
                assert!(owner == caller, "Not village owner");
            }
        }

        /// Check if a building_def_id is banned by any active covenant on this village.
        fn assert_not_banned(
            ref world: dojo::world::WorldStorage, village_id: u32, building_def_id: u32,
        ) {
            let counter: CovenantCounter = world.read_model(0_u8);
            let mut cid: u32 = 1;
            while cid <= counter.count {
                let cov: Covenant = world.read_model(cid);
                // Only check covenants that apply to this village and are active
                if !cov.repealed && cov.relevance > 0 && cov.village_id == village_id {
                    let mut ci: u8 = 0;
                    while ci < cov.clause_count {
                        let clause: CovenantClause = world.read_model((cid, ci));
                        if clause.clause_type == ClauseType::BuildingBan {
                            // param_a holds the banned building def_id
                            let banned_id: u32 = clause.param_a.try_into().unwrap();
                            assert!(banned_id != building_def_id, "Building banned by covenant");
                        }
                        ci += 1;
                    };
                }
                cid += 1;
            };
        }
    }
}

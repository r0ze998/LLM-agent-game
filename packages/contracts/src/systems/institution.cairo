// ============================================================
//  systems/institution.cairo — Layer 3: Institution system
// ============================================================

use autonomous_world::types::{InstitutionType, EffectType};

#[starknet::interface]
pub trait IInstitutionSys<T> {
    fn found(
        ref self: T,
        village_id: u32,
        inst_type: InstitutionType,
        name_hash: felt252,
        effect_types: Span<EffectType>,
        effect_values: Span<i128>,
        req_types: Span<u8>,
        req_params: Span<u32>,
    );
    fn join(ref self: T, village_id: u32, institution_id: u32);
    fn leave(ref self: T, village_id: u32, institution_id: u32);
    fn process_lifecycle(ref self: T, institution_id: u32);
}

#[dojo::contract]
pub mod institution_sys {
    use starknet::{ContractAddress, get_caller_address};
    use dojo::model::ModelStorage;
    use dojo::event::EventStorage;
    use super::{IInstitutionSys, InstitutionType, EffectType};
    use autonomous_world::models::institution::{
        Institution, InstitutionEffect, InstitutionMembership, InstitutionCounter,
        VillageInstitutionCount, JoinRequirement,
    };
    use autonomous_world::models::village::Village;
    use autonomous_world::models::building::{Building, BuildingCounter};
    use autonomous_world::models::technology::ResearchedTech;
    use autonomous_world::models::config::{PhysicsConfig, GameConfig};
    use autonomous_world::systems::physics::physics::InternalImpl as PhysicsInternal;

    const MAX_MEMBER_EFFECTS: u32 = 5;
    const MAX_INSTITUTIONS_PER_VILLAGE: u32 = 5;
    const MAX_REQUIREMENTS: u32 = 5;
    const MIN_MEMBERS_TO_SURVIVE: u32 = 1;
    const DECAY_RATE_WITH_MEMBERS: u128 = 1;
    const DECAY_RATE_EMPTY: u128 = 5;

    #[dojo::event]
    #[derive(Drop, Serde)]
    struct InstitutionFounded {
        #[key]
        institution_id: u32,
        founder_village_id: u32,
        institution_type: InstitutionType,
        tick: u64,
    }

    #[dojo::event]
    #[derive(Drop, Serde)]
    struct InstitutionJoined {
        #[key]
        institution_id: u32,
        village_id: u32,
        tick: u64,
    }

    #[dojo::event]
    #[derive(Drop, Serde)]
    struct InstitutionDissolved {
        #[key]
        institution_id: u32,
        tick: u64,
    }

    #[abi(embed_v0)]
    impl InstitutionSysImpl of IInstitutionSys<ContractState> {
        fn found(
            ref self: ContractState,
            village_id: u32,
            inst_type: InstitutionType,
            name_hash: felt252,
            effect_types: Span<EffectType>,
            effect_values: Span<i128>,
            req_types: Span<u8>,
            req_params: Span<u32>,
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
            assert!(effect_count <= MAX_MEMBER_EFFECTS, "Too many effects");
            assert!(effect_count == effect_values.len(), "Effect count mismatch");

            let req_count = req_types.len();
            assert!(req_count <= MAX_REQUIREMENTS, "Too many requirements");
            assert!(req_count == req_params.len(), "Requirement count mismatch");

            let config: PhysicsConfig = world.read_model(0_u8);
            let game_config: GameConfig = world.read_model(0_u8);

            let mut i: u32 = 0;
            while i < effect_count {
                assert!(
                    PhysicsInternal::validate_effect(@config, *effect_types.at(i), *effect_values.at(i)),
                    "Effect violates physics",
                );
                i += 1;
            };

            // Validate requirement types (0-3)
            i = 0;
            while i < req_count {
                let rt: u8 = *req_types.at(i);
                assert!(rt <= 3, "Invalid requirement type");
                i += 1;
            };

            let vic: VillageInstitutionCount = world.read_model(village_id);
            assert!(vic.count < MAX_INSTITUTIONS_PER_VILLAGE, "Too many institutions");

            let mut counter: InstitutionCounter = world.read_model(0_u8);
            counter.count += 1;
            let institution_id = counter.count;
            world.write_model(@counter);

            world.write_model(@Institution {
                institution_id, institution_type: inst_type, founder_address: caller,
                name_hash, founded_at_tick: game_config.current_tick,
                relevance: 1000, member_count: 1,
                effect_count: effect_count.try_into().unwrap(),
                requirement_count: req_count.try_into().unwrap(),
            });

            i = 0;
            while i < effect_count {
                world.write_model(@InstitutionEffect {
                    institution_id,
                    effect_index: i.try_into().unwrap(),
                    effect_type: *effect_types.at(i),
                    value: *effect_values.at(i),
                });
                i += 1;
            };

            // Store join requirements
            i = 0;
            while i < req_count {
                world.write_model(@JoinRequirement {
                    institution_id,
                    req_index: i.try_into().unwrap(),
                    req_type: *req_types.at(i),
                    param: *req_params.at(i),
                });
                i += 1;
            };

            world.write_model(@InstitutionMembership {
                institution_id, village_id, is_member: true,
                joined_at_tick: game_config.current_tick,
            });
            world.write_model(@VillageInstitutionCount { village_id, count: vic.count + 1 });

            world.emit_event(@InstitutionFounded {
                institution_id, founder_village_id: village_id,
                institution_type: inst_type, tick: game_config.current_tick,
            });
        }

        fn join(ref self: ContractState, village_id: u32, institution_id: u32) {
            let mut world = self.world(@"aw");
            let caller = get_caller_address();
            let village: Village = world.read_model(village_id);
            let zero: ContractAddress = starknet::contract_address_const::<0>();
            if village.owner != zero {
                assert!(village.owner == caller, "Not village owner");
            }

            let mut institution: Institution = world.read_model(institution_id);
            assert!(institution.relevance > 0, "Institution dissolved");

            let existing: InstitutionMembership = world.read_model((institution_id, village_id));
            assert!(!existing.is_member, "Already a member");

            let vic: VillageInstitutionCount = world.read_model(village_id);
            assert!(vic.count < MAX_INSTITUTIONS_PER_VILLAGE, "Too many institutions");

            // ── Validate JoinRequirements ──
            let mut ri: u8 = 0;
            while ri < institution.requirement_count {
                let req: JoinRequirement = world.read_model((institution_id, ri));
                if req.req_type == 0 {
                    // min_population
                    assert!(village.population >= req.param, "Population too low");
                } else if req.req_type == 1 {
                    // has_tech
                    let rt: ResearchedTech = world.read_model((village_id, req.param));
                    assert!(rt.researched_at_tick > 0, "Missing required tech");
                } else if req.req_type == 2 {
                    // has_building
                    let bc: BuildingCounter = world.read_model(village_id);
                    let mut found = false;
                    let mut bi: u32 = 0;
                    while bi < bc.count {
                        let bld: Building = world.read_model((village_id, bi));
                        if bld.active && bld.def_id == req.param {
                            found = true;
                            break;
                        }
                        bi += 1;
                    };
                    assert!(found, "Missing required building");
                } else if req.req_type == 3 {
                    // min_culture (×1000)
                    assert!(village.total_culture_points >= req.param.into(), "Culture too low");
                }
                ri += 1;
            };

            let game_config: GameConfig = world.read_model(0_u8);

            world.write_model(@InstitutionMembership {
                institution_id, village_id, is_member: true,
                joined_at_tick: game_config.current_tick,
            });

            institution.member_count += 1;
            world.write_model(@institution);
            world.write_model(@VillageInstitutionCount { village_id, count: vic.count + 1 });

            world.emit_event(@InstitutionJoined {
                institution_id, village_id, tick: game_config.current_tick,
            });
        }

        fn leave(ref self: ContractState, village_id: u32, institution_id: u32) {
            let mut world = self.world(@"aw");
            let caller = get_caller_address();
            let village: Village = world.read_model(village_id);
            let zero: ContractAddress = starknet::contract_address_const::<0>();
            if village.owner != zero {
                assert!(village.owner == caller, "Not village owner");
            }

            let existing: InstitutionMembership = world.read_model((institution_id, village_id));
            assert!(existing.is_member, "Not a member");

            world.write_model(@InstitutionMembership {
                institution_id, village_id, is_member: false,
                joined_at_tick: existing.joined_at_tick,
            });

            let mut institution: Institution = world.read_model(institution_id);
            if institution.member_count > 0 { institution.member_count -= 1; }
            world.write_model(@institution);

            let mut vic: VillageInstitutionCount = world.read_model(village_id);
            if vic.count > 0 { vic.count -= 1; }
            world.write_model(@vic);
        }

        fn process_lifecycle(ref self: ContractState, institution_id: u32) {
            let mut world = self.world(@"aw");
            let mut institution: Institution = world.read_model(institution_id);
            if institution.relevance == 0 { return; }

            let decay = if institution.member_count >= MIN_MEMBERS_TO_SURVIVE {
                DECAY_RATE_WITH_MEMBERS
            } else {
                DECAY_RATE_EMPTY
            };

            if institution.relevance > decay {
                institution.relevance -= decay;
            } else {
                institution.relevance = 0;
                let game_config: GameConfig = world.read_model(0_u8);
                world.emit_event(@InstitutionDissolved {
                    institution_id, tick: game_config.current_tick,
                });
            }
            world.write_model(@institution);
        }
    }
}

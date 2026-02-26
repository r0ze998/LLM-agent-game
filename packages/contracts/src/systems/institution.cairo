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
        VillageInstitutionCount,
    };
    use autonomous_world::models::village::Village;
    use autonomous_world::models::config::{PhysicsConfig, GameConfig};
    use autonomous_world::systems::physics::physics::InternalImpl as PhysicsInternal;

    const MAX_MEMBER_EFFECTS: u32 = 5;
    const MAX_INSTITUTIONS_PER_VILLAGE: u32 = 5;
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

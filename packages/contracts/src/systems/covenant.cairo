// ============================================================
//  systems/covenant.cairo — Layer 1: Covenant system
// ============================================================

use autonomous_world::types::{ClauseType, CovenantScope, EffectType};

#[starknet::interface]
pub trait ICovenantSys<T> {
    fn propose(
        ref self: T,
        village_id: u32,
        scope: CovenantScope,
        target_village_id: u32,
        name_hash: felt252,
        clause_types: Span<ClauseType>,
        clause_param_a: Span<i128>,
        clause_param_b: Span<i128>,
    );
    fn repeal(ref self: T, covenant_id: u32);
    fn decay_covenants(ref self: T, covenant_id: u32);
}

#[dojo::contract]
pub mod covenant_sys {
    use starknet::{ContractAddress, get_caller_address};
    use dojo::model::ModelStorage;
    use dojo::event::EventStorage;
    use super::{ICovenantSys, ClauseType, CovenantScope, EffectType};
    use autonomous_world::models::covenant::{
        Covenant, CovenantClause, CovenantCounter, VillageCovenantCount,
    };
    use autonomous_world::models::village::Village;
    use autonomous_world::models::config::{PhysicsConfig, GameConfig};
    use autonomous_world::systems::physics::physics::InternalImpl as PhysicsInternal;

    const MAX_CLAUSES_PER_COVENANT: u8 = 5;
    const MAX_ACTIVE_COVENANTS_PER_VILLAGE: u8 = 10;

    #[dojo::event]
    #[derive(Drop, Serde)]
    struct CovenantEnacted {
        #[key]
        covenant_id: u32,
        village_id: u32,
        name_hash: felt252,
        tick: u64,
    }

    #[abi(embed_v0)]
    impl CovenantSysImpl of ICovenantSys<ContractState> {
        fn propose(
            ref self: ContractState,
            village_id: u32,
            scope: CovenantScope,
            target_village_id: u32,
            name_hash: felt252,
            clause_types: Span<ClauseType>,
            clause_param_a: Span<i128>,
            clause_param_b: Span<i128>,
        ) {
            let mut world = self.world(@"aw");
            let caller = get_caller_address();
            let village: Village = world.read_model(village_id);
            let zero: ContractAddress = starknet::contract_address_const::<0>();
            if village.owner != zero {
                assert!(village.owner == caller, "Not village owner");
            }

            let clause_count: u32 = clause_types.len();
            assert!(clause_count > 0, "No clauses");
            assert!(clause_count <= MAX_CLAUSES_PER_COVENANT.into(), "Too many clauses");
            assert!(clause_count == clause_param_a.len(), "Param count mismatch");
            assert!(clause_count == clause_param_b.len(), "Param count mismatch");

            let mut vcc: VillageCovenantCount = world.read_model(village_id);
            assert!(vcc.count < MAX_ACTIVE_COVENANTS_PER_VILLAGE, "Too many active covenants");

            let config: PhysicsConfig = world.read_model(0_u8);
            let game_config: GameConfig = world.read_model(0_u8);

            let mut i: u32 = 0;
            while i < clause_count {
                let ct = *clause_types.at(i);
                let pa = *clause_param_a.at(i);
                let pb = *clause_param_b.at(i);
                InternalImpl::validate_clause_params(ct, pa, pb);

                let effects = InternalImpl::clause_to_effects(ct, pa, pb);
                let mut j: u32 = 0;
                while j < effects.len() {
                    let (etype, evalue) = *effects.at(j);
                    assert!(
                        PhysicsInternal::validate_effect(@config, etype, evalue),
                        "Effect violates physics",
                    );
                    j += 1;
                };
                i += 1;
            };

            let mut counter: CovenantCounter = world.read_model(0_u8);
            counter.count += 1;
            let covenant_id = counter.count;
            world.write_model(@counter);

            world.write_model(@Covenant {
                covenant_id, village_id, scope, target_village_id, name_hash,
                enacted_at_tick: game_config.current_tick,
                expires_at_tick: 0, repealed: false, relevance: 1000,
                clause_count: clause_count.try_into().unwrap(),
            });

            i = 0;
            while i < clause_count {
                world.write_model(@CovenantClause {
                    covenant_id,
                    clause_index: i.try_into().unwrap(),
                    clause_type: *clause_types.at(i),
                    param_a: *clause_param_a.at(i),
                    param_b: *clause_param_b.at(i),
                });
                i += 1;
            };

            vcc.count += 1;
            world.write_model(@vcc);

            world.emit_event(@CovenantEnacted {
                covenant_id, village_id, name_hash, tick: game_config.current_tick,
            });
        }

        fn repeal(ref self: ContractState, covenant_id: u32) {
            let mut world = self.world(@"aw");
            let caller = get_caller_address();
            let mut covenant: Covenant = world.read_model(covenant_id);
            assert!(!covenant.repealed, "Already repealed");

            let village: Village = world.read_model(covenant.village_id);
            let zero: ContractAddress = starknet::contract_address_const::<0>();
            if village.owner != zero {
                assert!(village.owner == caller, "Not village owner");
            }

            covenant.repealed = true;
            world.write_model(@covenant);

            let mut vcc: VillageCovenantCount = world.read_model(covenant.village_id);
            if vcc.count > 0 { vcc.count -= 1; }
            world.write_model(@vcc);
        }

        fn decay_covenants(ref self: ContractState, covenant_id: u32) {
            let mut world = self.world(@"aw");
            let config: PhysicsConfig = world.read_model(0_u8);
            let mut covenant: Covenant = world.read_model(covenant_id);
            if covenant.repealed || covenant.relevance == 0 { return; }

            let decay = config.relevance_decay_rate;
            if covenant.relevance > decay {
                covenant.relevance -= decay;
            } else {
                covenant.relevance = 0;
                covenant.repealed = true;
                let mut vcc: VillageCovenantCount = world.read_model(covenant.village_id);
                if vcc.count > 0 { vcc.count -= 1; }
                world.write_model(@vcc);
            }
            world.write_model(@covenant);
        }
    }

    #[generate_trait]
    pub impl InternalImpl of InternalTrait {
        fn clause_to_effects(
            clause_type: ClauseType, param_a: i128, param_b: i128,
        ) -> Array<(EffectType, i128)> {
            let mut effects: Array<(EffectType, i128)> = array![];
            match clause_type {
                ClauseType::TaxRate => {
                    effects.append((EffectType::TradeIncome, param_a * 5 / 1000));
                    effects.append((EffectType::ResourceProduction, -(param_a * 2 / 1000)));
                },
                ClauseType::TradeTariff => {
                    effects.append((EffectType::TradeIncome, param_a * 3 / 1000));
                },
                ClauseType::Conscription => {
                    effects.append((EffectType::DefenseBonus, param_a * 3 / 1000));
                    effects.append((EffectType::PopulationGrowth, -(param_a * 2 / 1000)));
                },
                ClauseType::ResourceSharing => {
                    effects.append((EffectType::ResourceProduction, param_a * 4 / 1000));
                },
                ClauseType::BuildingBan => {
                    effects.append((EffectType::BuildSpeed, -100));
                },
                ClauseType::BuildingSubsidy => {
                    effects.append((EffectType::BuildSpeed, param_a * 500 / 1000 / 1000));
                },
                ClauseType::ResearchFocus => {
                    effects.append((EffectType::ResearchPoints, param_a * 4 / 1000));
                },
                ClauseType::MilitaryPact => {
                    effects.append((EffectType::DefenseBonus, 200));
                    effects.append((EffectType::AttackBonus, 100));
                },
                ClauseType::NonAggression => {
                    effects.append((EffectType::TradeIncome, 1000));
                },
                ClauseType::Tribute => {
                    effects.append((EffectType::ResourceProduction, -(param_a * 200 / 1000 / 1000)));
                },
                ClauseType::ImmigrationPolicy => {
                    if param_a > 0 {
                        effects.append((EffectType::PopulationGrowth, 20));
                    } else {
                        effects.append((EffectType::PopulationGrowth, -10));
                    }
                },
                ClauseType::Rationing => {
                    effects.append((EffectType::FoodConsumptionMod, -(1000 - param_a)));
                    effects.append((EffectType::PopulationGrowth, -10));
                },
                ClauseType::Festival => {
                    effects.append((EffectType::CulturePoints, param_a));
                    effects.append((EffectType::ResourceProduction, -(param_b * 100 / 1000)));
                },
            }
            effects
        }

        fn validate_clause_params(clause_type: ClauseType, param_a: i128, param_b: i128) {
            match clause_type {
                ClauseType::TaxRate => {
                    assert!(param_a >= 0 && param_a <= 500, "tax_rate out of bounds");
                },
                ClauseType::TradeTariff => {
                    assert!(param_a >= 0 && param_a <= 300, "trade_tariff out of bounds");
                },
                ClauseType::Conscription => {
                    assert!(param_a >= 0 && param_a <= 200, "conscription out of bounds");
                },
                ClauseType::ResourceSharing => {
                    assert!(param_a >= 0 && param_a <= 500, "resource_sharing out of bounds");
                },
                ClauseType::BuildingBan => {
                    assert!(param_a > 0, "building_ban needs def id");
                },
                ClauseType::BuildingSubsidy => {
                    assert!(param_a >= 0 && param_a <= 500, "building_subsidy oob");
                },
                ClauseType::ResearchFocus => {
                    assert!(param_a >= 100 && param_a <= 500, "research_focus out of bounds");
                },
                ClauseType::MilitaryPact => {
                    assert!(param_a == 0 || param_a == 1000, "military_pact bool only");
                },
                ClauseType::NonAggression => {},
                ClauseType::Tribute => {
                    assert!(param_a >= 1000 && param_a <= 50_000, "tribute amount oob");
                },
                ClauseType::ImmigrationPolicy => {
                    assert!(param_a == 0 || param_a == 1000, "immigration bool only");
                },
                ClauseType::Rationing => {
                    assert!(param_a >= 500 && param_a <= 1000, "rationing mod oob");
                },
                ClauseType::Festival => {
                    assert!(param_a >= 1000 && param_a <= 5000, "festival bonus oob");
                    assert!(param_b >= 1000 && param_b <= 20000, "festival cost oob");
                },
            }
        }
    }
}

// ============================================================
//  systems/combat.cairo — Combat resolution with full effect
//  bonuses, unit-type advantages, and fortification.
// ============================================================

#[starknet::interface]
pub trait ICombat<T> {
    fn attack(ref self: T, attacker_village: u32, defender_village: u32);
}

#[dojo::contract]
pub mod combat {
    use starknet::{ContractAddress, get_caller_address, get_block_timestamp};
    use dojo::model::ModelStorage;
    use dojo::event::EventStorage;
    use super::ICombat;
    use autonomous_world::models::village::Village;
    use autonomous_world::models::building::{Building, BuildingDef, BuildingDefEffect, BuildingCounter};
    use autonomous_world::models::technology::{ResearchedTech, TechDef, TechDefEffect};
    use autonomous_world::models::military::{GarrisonUnit, UnitDef};
    use autonomous_world::models::diplomacy::DiplomaticRelation;
    use autonomous_world::models::config::{PhysicsConfig, GameConfig};
    use autonomous_world::types::{DiplomacyStatus, EffectType, UnitTag};
    use autonomous_world::systems::physics::physics::InternalImpl as PhysicsInternal;

    const COMBAT_RANDOM_MIN: u128 = 800;
    const COMBAT_RANDOM_MAX: u128 = 1200;
    const ATTACKER_LOSS_RATE: u128 = 400;
    const DEFENDER_LOSS_RATE: u128 = 300;
    const VETERANCY_GAIN: u32 = 10;
    // Unit-type advantage multiplier (×1000): anti_cavalry vs cavalry = 1.5x
    const TYPE_ADVANTAGE_BONUS: u128 = 500;  // +50%

    #[dojo::event]
    #[derive(Drop, Serde)]
    struct CombatResolved {
        #[key]
        attacker_village: u32,
        #[key]
        defender_village: u32,
        tick: u64,
        attacker_power: u128,
        defender_power: u128,
        attacker_won: bool,
    }

    #[abi(embed_v0)]
    impl CombatImpl of ICombat<ContractState> {
        fn attack(ref self: ContractState, attacker_village: u32, defender_village: u32) {
            let mut world = self.world(@"aw");
            let caller = get_caller_address();
            let atk_village: Village = world.read_model(attacker_village);
            let zero: ContractAddress = starknet::contract_address_const::<0>();
            if atk_village.owner != zero {
                assert!(atk_village.owner == caller, "Not village owner");
            }
            assert!(attacker_village != defender_village, "Cannot attack self");

            let (a, b) = if attacker_village < defender_village {
                (attacker_village, defender_village)
            } else {
                (defender_village, attacker_village)
            };
            let relation: DiplomaticRelation = world.read_model((a, b));
            assert!(relation.status != DiplomacyStatus::Allied, "Cannot attack ally");

            let game_config: GameConfig = world.read_model(0_u8);
            let config: PhysicsConfig = world.read_model(0_u8);

            // ── Aggregate attack/defense bonuses from buildings + techs ──
            let atk_bonus = InternalImpl::aggregate_combat_bonus(ref world, @config, attacker_village, true);
            let def_bonus = InternalImpl::aggregate_combat_bonus(ref world, @config, defender_village, false);
            let fortification = InternalImpl::aggregate_fortification(ref world, @config, defender_village);

            // ── Calculate attacker power (with bonuses) ──
            let mut atk_power: u128 = 0;
            let mut atk_has_cavalry = false;
            let mut atk_has_anti_cav = false;
            let mut unit_id: u32 = 0;
            while unit_id < 100 {
                let garrison: GarrisonUnit = world.read_model((attacker_village, unit_id));
                if garrison.count > 0 {
                    let udef: UnitDef = world.read_model(unit_id);
                    if udef.hp > 0 {
                        let base: u128 = garrison.count.into() * udef.attack.into();
                        let vet: u128 = garrison.veterancy.into() * garrison.count.into();
                        atk_power += base + vet;
                        if udef.tag_primary == UnitTag::Cavalry || udef.tag_secondary == UnitTag::Cavalry {
                            atk_has_cavalry = true;
                        }
                        if udef.tag_primary == UnitTag::AntiCavalry || udef.tag_secondary == UnitTag::AntiCavalry {
                            atk_has_anti_cav = true;
                        }
                    }
                }
                unit_id += 1;
            };
            assert!(atk_power > 0, "No units to attack with");
            // Apply attack bonus: power * (1000 + bonus) / 1000
            atk_power = atk_power * (1000 + InternalImpl::i128_to_u128_safe(atk_bonus)) / 1000;

            // ── Calculate defender power (with bonuses + fortification) ──
            let mut def_power: u128 = fortification; // Fortification as base
            let mut def_has_cavalry = false;
            let mut def_has_anti_cav = false;
            unit_id = 0;
            while unit_id < 100 {
                let garrison: GarrisonUnit = world.read_model((defender_village, unit_id));
                if garrison.count > 0 {
                    let udef: UnitDef = world.read_model(unit_id);
                    if udef.hp > 0 {
                        let base: u128 = garrison.count.into() * udef.defense.into();
                        let vet: u128 = garrison.veterancy.into() * garrison.count.into();
                        def_power += base + vet;
                        if udef.tag_primary == UnitTag::Cavalry || udef.tag_secondary == UnitTag::Cavalry {
                            def_has_cavalry = true;
                        }
                        if udef.tag_primary == UnitTag::AntiCavalry || udef.tag_secondary == UnitTag::AntiCavalry {
                            def_has_anti_cav = true;
                        }
                    }
                }
                unit_id += 1;
            };
            def_power = def_power * (1000 + InternalImpl::i128_to_u128_safe(def_bonus)) / 1000;

            // ── Unit-type advantage: anti-cavalry vs cavalry ──
            if atk_has_anti_cav && def_has_cavalry {
                atk_power = atk_power * (1000 + TYPE_ADVANTAGE_BONUS) / 1000;
            }
            if def_has_anti_cav && atk_has_cavalry {
                def_power = def_power * (1000 + TYPE_ADVANTAGE_BONUS) / 1000;
            }

            // ── Pseudo-random modifier ──
            let ts: u128 = get_block_timestamp().into();
            let random_mod = COMBAT_RANDOM_MIN + (ts % (COMBAT_RANDOM_MAX - COMBAT_RANDOM_MIN + 1));
            let adjusted_atk = atk_power * random_mod / 1000;
            let attacker_won = adjusted_atk > def_power;

            if attacker_won {
                InternalImpl::apply_losses(ref world, defender_village, DEFENDER_LOSS_RATE);
                InternalImpl::apply_losses(ref world, attacker_village, ATTACKER_LOSS_RATE / 2);
                InternalImpl::add_veterancy(ref world, attacker_village, VETERANCY_GAIN);
                // Plunder 10%
                let mut def_v: Village = world.read_model(defender_village);
                let mut atk_v: Village = world.read_model(attacker_village);
                let pr: u128 = 100;
                atk_v.food += def_v.food * pr / 1000; atk_v.wood += def_v.wood * pr / 1000;
                atk_v.stone += def_v.stone * pr / 1000; atk_v.iron += def_v.iron * pr / 1000;
                atk_v.gold += def_v.gold * pr / 1000;
                def_v.food -= def_v.food * pr / 1000; def_v.wood -= def_v.wood * pr / 1000;
                def_v.stone -= def_v.stone * pr / 1000; def_v.iron -= def_v.iron * pr / 1000;
                def_v.gold -= def_v.gold * pr / 1000;
                world.write_model(@atk_v); world.write_model(@def_v);
            } else {
                InternalImpl::apply_losses(ref world, attacker_village, ATTACKER_LOSS_RATE);
                InternalImpl::apply_losses(ref world, defender_village, DEFENDER_LOSS_RATE / 2);
                InternalImpl::add_veterancy(ref world, defender_village, VETERANCY_GAIN);
            }

            world.emit_event(@CombatResolved {
                attacker_village, defender_village, tick: game_config.current_tick,
                attacker_power: adjusted_atk, defender_power: def_power, attacker_won,
            });
        }
    }

    #[generate_trait]
    impl InternalImpl of InternalTrait {
        /// Aggregate attack or defense bonus from buildings + techs for a village.
        fn aggregate_combat_bonus(
            ref world: dojo::world::WorldStorage, config: @PhysicsConfig,
            village_id: u32, is_attack: bool,
        ) -> i128 {
            let target_type = if is_attack { EffectType::AttackBonus } else { EffectType::DefenseBonus };
            let mut total: i128 = 0;

            // Buildings
            let bc: BuildingCounter = world.read_model(village_id);
            let mut i: u32 = 0;
            while i < bc.count {
                let bld: Building = world.read_model((village_id, i));
                if bld.active {
                    let bdef: BuildingDef = world.read_model(bld.def_id);
                    let mut e: u8 = 0;
                    while e < bdef.effect_count {
                        let eff: BuildingDefEffect = world.read_model((bld.def_id, e));
                        if eff.effect_type == target_type {
                            total += PhysicsInternal::clamp_effect(config, eff.effect_type, eff.value);
                        }
                        e += 1;
                    };
                }
                i += 1;
            };

            // Techs
            let mut t: u32 = 0;
            while t < 100 {
                let rt: ResearchedTech = world.read_model((village_id, t));
                if rt.researched_at_tick > 0 {
                    let tdef: TechDef = world.read_model(t);
                    let mut e: u8 = 0;
                    while e < tdef.effect_count {
                        let eff: TechDefEffect = world.read_model((t, e));
                        if eff.effect_type == target_type {
                            total += PhysicsInternal::clamp_effect(config, eff.effect_type, eff.value);
                        }
                        e += 1;
                    };
                }
                t += 1;
            };
            total
        }

        /// Aggregate fortification from buildings.
        fn aggregate_fortification(
            ref world: dojo::world::WorldStorage, config: @PhysicsConfig, village_id: u32,
        ) -> u128 {
            let mut total: i128 = 0;
            let bc: BuildingCounter = world.read_model(village_id);
            let mut i: u32 = 0;
            while i < bc.count {
                let bld: Building = world.read_model((village_id, i));
                if bld.active {
                    let bdef: BuildingDef = world.read_model(bld.def_id);
                    let mut e: u8 = 0;
                    while e < bdef.effect_count {
                        let eff: BuildingDefEffect = world.read_model((bld.def_id, e));
                        if eff.effect_type == EffectType::Fortification {
                            total += PhysicsInternal::clamp_effect(config, eff.effect_type, eff.value);
                        }
                        e += 1;
                    };
                }
                i += 1;
            };
            if total > 0 { total.try_into().unwrap() } else { 0 }
        }

        fn i128_to_u128_safe(v: i128) -> u128 { if v > 0 { v.try_into().unwrap() } else { 0 } }

        fn apply_losses(ref world: dojo::world::WorldStorage, village_id: u32, loss_rate: u128) {
            let mut uid: u32 = 0;
            while uid < 100 {
                let mut g: GarrisonUnit = world.read_model((village_id, uid));
                if g.count > 0 {
                    let loss: u128 = g.count.into() * loss_rate / 1000;
                    let l32: u32 = if loss > 0xFFFFFFFF_u128 { g.count } else { let l: u32 = loss.try_into().unwrap(); if l == 0 { 1 } else { l } };
                    if g.count > l32 { g.count -= l32; } else { g.count = 0; }
                    world.write_model(@g);
                }
                uid += 1;
            };
        }

        fn add_veterancy(ref world: dojo::world::WorldStorage, village_id: u32, gain: u32) {
            let mut uid: u32 = 0;
            while uid < 100 {
                let mut g: GarrisonUnit = world.read_model((village_id, uid));
                if g.count > 0 { g.veterancy += gain; world.write_model(@g); }
                uid += 1;
            };
        }
    }
}

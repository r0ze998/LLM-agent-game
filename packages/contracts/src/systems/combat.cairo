// ============================================================
//  systems/combat.cairo — Combat resolution
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
    use autonomous_world::models::military::{GarrisonUnit, UnitDef};
    use autonomous_world::models::diplomacy::DiplomaticRelation;
    use autonomous_world::models::config::GameConfig;
    use autonomous_world::types::DiplomacyStatus;

    const COMBAT_RANDOM_MIN: u128 = 800;
    const COMBAT_RANDOM_MAX: u128 = 1200;
    const ATTACKER_LOSS_RATE: u128 = 400;
    const DEFENDER_LOSS_RATE: u128 = 300;
    const VETERANCY_GAIN: u32 = 10;

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

            // ── Calculate attacker power ──
            let mut atk_power: u128 = 0;
            let mut unit_id: u32 = 0;
            while unit_id < 100 {
                let garrison: GarrisonUnit = world.read_model((attacker_village, unit_id));
                if garrison.count > 0 {
                    let udef: UnitDef = world.read_model(unit_id);
                    if udef.hp > 0 {
                        let power: u128 = garrison.count.into() * udef.attack.into();
                        let vet_bonus = garrison.veterancy.into() * garrison.count.into();
                        atk_power += power + vet_bonus;
                    }
                }
                unit_id += 1;
            };
            assert!(atk_power > 0, "No units to attack with");

            // ── Calculate defender power ──
            let mut def_power: u128 = 0;
            unit_id = 0;
            while unit_id < 100 {
                let garrison: GarrisonUnit = world.read_model((defender_village, unit_id));
                if garrison.count > 0 {
                    let udef: UnitDef = world.read_model(unit_id);
                    if udef.hp > 0 {
                        let power: u128 = garrison.count.into() * udef.defense.into();
                        let vet_bonus = garrison.veterancy.into() * garrison.count.into();
                        def_power += power + vet_bonus;
                    }
                }
                unit_id += 1;
            };

            // ── Pseudo-random modifier ──
            let ts: u128 = get_block_timestamp().into();
            let random_mod = COMBAT_RANDOM_MIN
                + (ts % (COMBAT_RANDOM_MAX - COMBAT_RANDOM_MIN + 1));

            let adjusted_atk = atk_power * random_mod / 1000;
            let attacker_won = adjusted_atk > def_power;

            if attacker_won {
                InternalImpl::apply_losses(ref world, defender_village, DEFENDER_LOSS_RATE);
                InternalImpl::apply_losses(ref world, attacker_village, ATTACKER_LOSS_RATE / 2);
                InternalImpl::add_veterancy(ref world, attacker_village, VETERANCY_GAIN);

                let mut def_v: Village = world.read_model(defender_village);
                let mut atk_v: Village = world.read_model(attacker_village);
                let plunder_rate: u128 = 100;
                atk_v.food += def_v.food * plunder_rate / 1000;
                atk_v.wood += def_v.wood * plunder_rate / 1000;
                atk_v.stone += def_v.stone * plunder_rate / 1000;
                atk_v.iron += def_v.iron * plunder_rate / 1000;
                atk_v.gold += def_v.gold * plunder_rate / 1000;
                def_v.food -= def_v.food * plunder_rate / 1000;
                def_v.wood -= def_v.wood * plunder_rate / 1000;
                def_v.stone -= def_v.stone * plunder_rate / 1000;
                def_v.iron -= def_v.iron * plunder_rate / 1000;
                def_v.gold -= def_v.gold * plunder_rate / 1000;
                world.write_model(@atk_v);
                world.write_model(@def_v);
            } else {
                InternalImpl::apply_losses(ref world, attacker_village, ATTACKER_LOSS_RATE);
                InternalImpl::apply_losses(ref world, defender_village, DEFENDER_LOSS_RATE / 2);
                InternalImpl::add_veterancy(ref world, defender_village, VETERANCY_GAIN);
            }

            world.emit_event(@CombatResolved {
                attacker_village, defender_village,
                tick: game_config.current_tick,
                attacker_power: adjusted_atk, defender_power: def_power,
                attacker_won,
            });
        }
    }

    #[generate_trait]
    impl InternalImpl of InternalTrait {
        fn apply_losses(ref world: dojo::world::WorldStorage, village_id: u32, loss_rate: u128) {
            let mut unit_id: u32 = 0;
            while unit_id < 100 {
                let mut garrison: GarrisonUnit = world.read_model((village_id, unit_id));
                if garrison.count > 0 {
                    let loss: u128 = garrison.count.into() * loss_rate / 1000;
                    let loss32: u32 = if loss > 0xFFFFFFFF_u128 {
                        garrison.count
                    } else {
                        let l: u32 = loss.try_into().unwrap();
                        if l == 0 && garrison.count > 0 { 1 } else { l }
                    };
                    if garrison.count > loss32 {
                        garrison.count -= loss32;
                    } else {
                        garrison.count = 0;
                    }
                    world.write_model(@garrison);
                }
                unit_id += 1;
            };
        }

        fn add_veterancy(ref world: dojo::world::WorldStorage, village_id: u32, gain: u32) {
            let mut unit_id: u32 = 0;
            while unit_id < 100 {
                let mut garrison: GarrisonUnit = world.read_model((village_id, unit_id));
                if garrison.count > 0 {
                    garrison.veterancy += gain;
                    world.write_model(@garrison);
                }
                unit_id += 1;
            };
        }
    }
}

// ============================================================
//  systems/victory.cairo — Full victory conditions:
//  Score, Culture, Domination, Diplomacy, Tech Mastery
// ============================================================

#[starknet::interface]
pub trait IVictory<T> {
    fn check_victory(ref self: T, village_id: u32) -> u8;
}

#[dojo::contract]
pub mod victory {
    use dojo::model::ModelStorage;
    use dojo::event::EventStorage;
    use super::IVictory;
    use autonomous_world::models::village::Village;
    use autonomous_world::models::technology::ResearchedTech;
    use autonomous_world::models::diplomacy::DiplomaticRelation;
    use autonomous_world::models::config::{GameConfig, GameCounter};
    use autonomous_world::types::DiplomacyStatus;

    const SCORE_VICTORY_TICK: u64 = 12000;
    const CULTURE_VICTORY_THRESHOLD: u128 = 1_000_000;  // 1000.0 ×1000
    const DOMINATION_RATIO_NUM: u32 = 75;               // 75%
    const DIPLOMACY_RATIO_NUM: u32 = 60;                 // 60%

    // Tech mastery: tier-10 tech IDs (one per branch)
    const AGRICULTURE_MASTERY_ID: u32 = 10;
    const MILITARY_MASTERY_ID: u32 = 20;
    const CULTURE_MASTERY_ID: u32 = 30;

    const NO_VICTORY: u8 = 0;
    const VICTORY_SCORE: u8 = 1;
    const VICTORY_CULTURE: u8 = 2;
    const VICTORY_DOMINATION: u8 = 3;
    const VICTORY_DIPLOMACY: u8 = 4;
    const VICTORY_TECH_MASTERY: u8 = 5;

    #[dojo::event]
    #[derive(Drop, Serde)]
    struct VictoryAchieved {
        #[key]
        village_id: u32,
        victory_type: u8,
        tick: u64,
    }

    #[abi(embed_v0)]
    impl VictoryImpl of IVictory<ContractState> {
        fn check_victory(ref self: ContractState, village_id: u32) -> u8 {
            let mut world = self.world(@"aw");
            let village: Village = world.read_model(village_id);
            let game_config: GameConfig = world.read_model(0_u8);
            let counter: GameCounter = world.read_model(0_u8);
            let total = counter.village_count;

            // ── Culture victory ──
            if village.total_culture_points >= CULTURE_VICTORY_THRESHOLD {
                world.emit_event(@VictoryAchieved {
                    village_id, victory_type: VICTORY_CULTURE, tick: game_config.current_tick,
                });
                return VICTORY_CULTURE;
            }

            // ── Domination victory: own >= 75% of villages ──
            if total >= 2 {
                let mut owned: u32 = 0;
                let mut i: u32 = 1;
                while i <= total {
                    let v: Village = world.read_model(i);
                    if v.owner == village.owner {
                        owned += 1;
                    }
                    i += 1;
                };
                // owned * 100 >= total * 75
                if owned * 100 >= total * DOMINATION_RATIO_NUM {
                    world.emit_event(@VictoryAchieved {
                        village_id, victory_type: VICTORY_DOMINATION, tick: game_config.current_tick,
                    });
                    return VICTORY_DOMINATION;
                }
            }

            // ── Diplomacy victory: >= 60% of other villages are allied ──
            if total >= 3 {
                let mut allied_count: u32 = 0;
                let mut i: u32 = 1;
                while i <= total {
                    if i != village_id {
                        let (a, b) = if village_id < i { (village_id, i) } else { (i, village_id) };
                        let rel: DiplomaticRelation = world.read_model((a, b));
                        if rel.status == DiplomacyStatus::Allied {
                            allied_count += 1;
                        }
                    }
                    i += 1;
                };
                let others = total - 1;
                // allied_count * 100 >= others * 60
                if allied_count * 100 >= others * DIPLOMACY_RATIO_NUM {
                    world.emit_event(@VictoryAchieved {
                        village_id, victory_type: VICTORY_DIPLOMACY, tick: game_config.current_tick,
                    });
                    return VICTORY_DIPLOMACY;
                }
            }

            // ── Tech mastery victory: all 3 branch tier-10 techs researched ──
            let agri: ResearchedTech = world.read_model((village_id, AGRICULTURE_MASTERY_ID));
            let mili: ResearchedTech = world.read_model((village_id, MILITARY_MASTERY_ID));
            let cult: ResearchedTech = world.read_model((village_id, CULTURE_MASTERY_ID));
            if agri.researched_at_tick > 0 && mili.researched_at_tick > 0 && cult.researched_at_tick > 0 {
                world.emit_event(@VictoryAchieved {
                    village_id, victory_type: VICTORY_TECH_MASTERY, tick: game_config.current_tick,
                });
                return VICTORY_TECH_MASTERY;
            }

            // ── Score victory (time-based) ──
            if game_config.current_tick >= SCORE_VICTORY_TICK {
                let mut highest_score: u32 = 0;
                let mut highest_village: u32 = 0;
                let mut i: u32 = 1;
                while i <= total {
                    let v: Village = world.read_model(i);
                    if v.score > highest_score {
                        highest_score = v.score;
                        highest_village = i;
                    }
                    i += 1;
                };
                if highest_village == village_id {
                    world.emit_event(@VictoryAchieved {
                        village_id, victory_type: VICTORY_SCORE, tick: game_config.current_tick,
                    });
                    return VICTORY_SCORE;
                }
            }

            NO_VICTORY
        }
    }
}

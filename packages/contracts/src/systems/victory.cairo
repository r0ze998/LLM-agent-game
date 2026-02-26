// ============================================================
//  systems/victory.cairo — Victory condition checks
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
    use autonomous_world::models::config::{GameConfig, GameCounter};

    const SCORE_VICTORY_TICK: u64 = 12000;
    const CULTURE_VICTORY_THRESHOLD: u128 = 1_000_000;
    const NO_VICTORY: u8 = 0;
    const VICTORY_SCORE: u8 = 1;
    const VICTORY_CULTURE: u8 = 2;

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

            if village.total_culture_points >= CULTURE_VICTORY_THRESHOLD {
                world.emit_event(@VictoryAchieved {
                    village_id, victory_type: VICTORY_CULTURE, tick: game_config.current_tick,
                });
                return VICTORY_CULTURE;
            }

            if game_config.current_tick >= SCORE_VICTORY_TICK {
                let total = counter.village_count;
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

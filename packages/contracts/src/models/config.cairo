/// Layer 0 physics constants — immutable singleton (config_id = 0).
/// All bound values are ×1000 fixed-point.
/// Set once in dojo_init(); no system may modify after initialization.
#[dojo::model]
#[derive(Drop, Serde)]
pub struct PhysicsConfig {
    #[key]
    pub config_id: u8,                  // always 0

    // ── EFFECT_BOUNDS (min/max ×1000) ──
    pub resource_production_min: i128,  // -10_000
    pub resource_production_max: i128,  //  20_000
    pub resource_storage_min: i128,     // -100_000
    pub resource_storage_max: i128,     //  500_000
    pub housing_min: i128,              //  0
    pub housing_max: i128,              //  50_000
    pub research_points_min: i128,      // -5_000
    pub research_points_max: i128,      //  10_000
    pub culture_points_min: i128,       // -5_000
    pub culture_points_max: i128,       //  10_000
    pub tile_yield_mod_min: i128,       // -500
    pub tile_yield_mod_max: i128,       //  2_000
    pub attack_bonus_min: i128,         // -500
    pub attack_bonus_max: i128,         //  2_000
    pub defense_bonus_min: i128,        // -500
    pub defense_bonus_max: i128,        //  2_000
    pub unit_training_speed_min: i128,  // -500
    pub unit_training_speed_max: i128,  //  1_000
    pub build_speed_min: i128,          // -500
    pub build_speed_max: i128,          //  1_000
    pub population_growth_min: i128,    // -50
    pub population_growth_max: i128,    //  100
    pub food_consumption_mod_min: i128, // -500
    pub food_consumption_mod_max: i128, //  1_000
    pub trade_income_min: i128,         // -5_000
    pub trade_income_max: i128,         //  10_000
    pub vision_range_min: i128,         // -3_000
    pub vision_range_max: i128,         //  10_000
    pub fortification_min: i128,        //  0
    pub fortification_max: i128,        //  100_000
    pub heal_per_tick_min: i128,        //  0
    pub heal_per_tick_max: i128,        //  10_000
    pub unlock_unit_min: i128,          //  0
    pub unlock_unit_max: i128,          //  1_000
    pub unlock_building_min: i128,      //  0
    pub unlock_building_max: i128,      //  1_000

    // ── Physical constants ──
    pub min_building_cost: u32,         // 1
    pub min_research_cost: u128,        // 5_000 (×1000)
    pub min_unit_upkeep_food: u128,     // 500 (×1000 = 0.5)
    pub max_territory_radius: u32,      // 15
    pub min_build_ticks: u32,           // 1
    pub decay_hp_per_tick: u32,         // 1
    pub starvation_pop_loss_rate: u128, // 10 (×1000 = 0.01)
    pub relevance_decay_rate: u128,     // 10 (×1000 = 0.01)
}

/// Game-wide configuration (game_id = 0).
#[dojo::model]
#[derive(Drop, Serde)]
pub struct GameConfig {
    #[key]
    pub game_id: u8,                    // always 0
    pub current_tick: u64,
    pub tick_interval_seconds: u64,     // real-time seconds per tick
    pub max_villages: u32,
    pub initialized: bool,
}

/// Global counter for assigning unique village IDs.
#[dojo::model]
#[derive(Drop, Serde)]
pub struct GameCounter {
    #[key]
    pub id: u8,                         // always 0
    pub village_count: u32,
    pub building_def_count: u32,
    pub tech_def_count: u32,
    pub unit_def_count: u32,
}

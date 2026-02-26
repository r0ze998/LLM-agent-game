use autonomous_world::types::{EffectType, ResourceType};

/// A placed building instance in a village.
#[dojo::model]
#[derive(Drop, Serde)]
pub struct Building {
    #[key]
    pub village_id: u32,
    #[key]
    pub building_id: u32,
    pub def_id: u32,
    pub pos_x: u32,
    pub pos_y: u32,
    pub hp: u32,
    pub max_hp: u32,
    pub built_at_tick: u64,
    pub active: bool,
}

/// Static definition of a building type.
/// Hardcoded buildings (def_id < 1000) set at init; invented ones created by players.
#[dojo::model]
#[derive(Drop, Serde)]
pub struct BuildingDef {
    #[key]
    pub def_id: u32,
    pub name_hash: felt252,
    // ── Costs (×1000) ──
    pub cost_food: u128,
    pub cost_wood: u128,
    pub cost_stone: u128,
    pub cost_iron: u128,
    pub cost_gold: u128,
    pub build_ticks: u32,
    pub max_hp: u32,
    pub effect_count: u8,
    // ── Prerequisites ──
    pub requires_tech_id: u32,  // 0 = none
    pub is_invention: bool,     // true if created via Layer 2
    pub invention_id: u32,      // link to Invention model (0 if hardcoded)
}

/// Effect slot for a BuildingDef.
#[dojo::model]
#[derive(Drop, Serde)]
pub struct BuildingDefEffect {
    #[key]
    pub def_id: u32,
    #[key]
    pub effect_index: u8,
    pub effect_type: EffectType,
    pub value: i128,
    pub target_resource: ResourceType,
}

/// Active build queue item for a village.
#[dojo::model]
#[derive(Drop, Serde)]
pub struct BuildQueue {
    #[key]
    pub village_id: u32,
    #[key]
    pub queue_index: u8,
    pub def_id: u32,
    pub pos_x: u32,
    pub pos_y: u32,
    pub started_at_tick: u64,
    pub completes_at_tick: u64,
    pub active: bool,
}

/// Counter for building instances per village.
#[dojo::model]
#[derive(Drop, Serde)]
pub struct BuildingCounter {
    #[key]
    pub village_id: u32,
    pub count: u32,
}

/// Counter for build queue items per village.
#[dojo::model]
#[derive(Drop, Serde)]
pub struct BuildQueueCounter {
    #[key]
    pub village_id: u32,
    pub count: u8,
}

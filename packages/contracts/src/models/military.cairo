use autonomous_world::types::UnitTag;

/// Garrison unit in a village.
#[dojo::model]
#[derive(Drop, Serde)]
pub struct GarrisonUnit {
    #[key]
    pub village_id: u32,
    #[key]
    pub unit_def_id: u32,
    pub count: u32,
    pub veterancy: u32,
}

/// Static definition of a unit type.
#[dojo::model]
#[derive(Drop, Serde)]
pub struct UnitDef {
    #[key]
    pub unit_def_id: u32,
    pub name_hash: felt252,
    pub attack: u32,
    pub defense: u32,
    pub hp: u32,
    pub speed: u32,
    pub range: u32,
    // ── Costs (×1000) ──
    pub cost_food: u128,
    pub cost_wood: u128,
    pub cost_stone: u128,
    pub cost_iron: u128,
    pub cost_gold: u128,
    // ── Upkeep (×1000 per tick) ──
    pub upkeep_food: u128,
    pub upkeep_gold: u128,
    pub tag_primary: UnitTag,
    pub tag_secondary: UnitTag,
    // ── Prerequisites ──
    pub requires_tech_id: u32,
    pub requires_building_def_id: u32,
    pub train_ticks: u32,
    pub is_invention: bool,
    pub invention_id: u32,
}

/// Active training queue item.
#[dojo::model]
#[derive(Drop, Serde)]
pub struct TrainQueue {
    #[key]
    pub village_id: u32,
    #[key]
    pub queue_index: u8,
    pub unit_def_id: u32,
    pub count: u32,
    pub started_at_tick: u64,
    pub completes_at_tick: u64,
    pub active: bool,
}

/// Counter for training queue items per village.
#[dojo::model]
#[derive(Drop, Serde)]
pub struct TrainQueueCounter {
    #[key]
    pub village_id: u32,
    pub count: u8,
}

use autonomous_world::types::{EffectType, ResourceType};

/// A researched technology in a village.
#[dojo::model]
#[derive(Drop, Serde)]
pub struct ResearchedTech {
    #[key]
    pub village_id: u32,
    #[key]
    pub tech_id: u32,
    pub researched_at_tick: u64,
}

/// Static definition of a technology.
#[dojo::model]
#[derive(Drop, Serde)]
pub struct TechDef {
    #[key]
    pub tech_id: u32,
    pub name_hash: felt252,
    pub research_cost: u128,        // ×1000
    pub research_ticks: u32,
    pub tier: u8,
    pub requires_tech_id: u32,      // 0 = none
    pub effect_count: u8,
    pub is_invention: bool,
    pub invention_id: u32,
}

/// Effect slot for a TechDef.
#[dojo::model]
#[derive(Drop, Serde)]
pub struct TechDefEffect {
    #[key]
    pub tech_id: u32,
    #[key]
    pub effect_index: u8,
    pub effect_type: EffectType,
    pub value: i128,
    pub target_resource: ResourceType,
}

/// Active research queue item for a village.
#[dojo::model]
#[derive(Drop, Serde)]
pub struct ResearchQueue {
    #[key]
    pub village_id: u32,
    pub tech_id: u32,
    pub started_at_tick: u64,
    pub completes_at_tick: u64,
    pub active: bool,
}

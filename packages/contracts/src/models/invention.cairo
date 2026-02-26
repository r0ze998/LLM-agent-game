use starknet::ContractAddress;
use autonomous_world::types::{InventionType, EffectType};

/// An invention (Layer 2) — a player-created building, tech, or unit definition.
#[dojo::model]
#[derive(Drop, Serde)]
pub struct Invention {
    #[key]
    pub invention_id: u32,
    pub invention_type: InventionType,
    pub inventor_address: ContractAddress,
    pub origin_village_id: u32,
    pub name_hash: felt252,
    pub invented_at_tick: u64,
    pub relevance: u128,            // ×1000 (starts at 1000)
    pub effect_count: u8,
    pub total_cost: u128,           // ×1000 (sum of all resource costs for validation)
}

/// Effect slot for an invention.
#[dojo::model]
#[derive(Drop, Serde)]
pub struct InventionEffect {
    #[key]
    pub invention_id: u32,
    #[key]
    pub effect_index: u8,
    pub effect_type: EffectType,
    pub value: i128,                // ×1000
}

/// Knowledge tracking: which villages know about which inventions.
#[dojo::model]
#[derive(Drop, Serde)]
pub struct InventionKnowledge {
    #[key]
    pub invention_id: u32,
    #[key]
    pub village_id: u32,
    pub known: bool,
}

/// Counter for invention IDs (singleton).
#[dojo::model]
#[derive(Drop, Serde)]
pub struct InventionCounter {
    #[key]
    pub id: u8,                     // always 0
    pub count: u32,
}

/// Number of inventions created by a village.
#[dojo::model]
#[derive(Drop, Serde)]
pub struct VillageInventionCount {
    #[key]
    pub village_id: u32,
    pub count: u32,
}

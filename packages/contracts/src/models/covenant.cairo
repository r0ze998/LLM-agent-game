use autonomous_world::types::{CovenantScope, ClauseType};

/// A covenant (Layer 1 contract) enacted by a village.
#[dojo::model]
#[derive(Drop, Serde)]
pub struct Covenant {
    #[key]
    pub covenant_id: u32,
    pub village_id: u32,
    pub scope: CovenantScope,
    pub target_village_id: u32,     // 0 = N/A (Village or Global scope)
    pub name_hash: felt252,
    pub enacted_at_tick: u64,
    pub expires_at_tick: u64,       // 0 = no expiry
    pub repealed: bool,
    pub relevance: u128,            // ×1000 fixed-point (starts at 1000)
    pub clause_count: u8,
}

/// A single clause within a covenant.
#[dojo::model]
#[derive(Drop, Serde)]
pub struct CovenantClause {
    #[key]
    pub covenant_id: u32,
    #[key]
    pub clause_index: u8,
    pub clause_type: ClauseType,
    pub param_a: i128,              // primary parameter (rate, ratio, amount ×1000)
    pub param_b: i128,              // secondary parameter (resource type as u8, etc.)
}

/// Counter for covenant IDs (singleton).
#[dojo::model]
#[derive(Drop, Serde)]
pub struct CovenantCounter {
    #[key]
    pub id: u8,                     // always 0
    pub count: u32,
}

/// Active covenant count per village.
#[dojo::model]
#[derive(Drop, Serde)]
pub struct VillageCovenantCount {
    #[key]
    pub village_id: u32,
    pub count: u8,
}

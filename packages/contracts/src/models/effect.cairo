use autonomous_world::types::{EffectType, ResourceType};

/// A resolved (aggregated) effect value for a village.
/// Written by village_tick system after aggregating all layers.
#[dojo::model]
#[derive(Drop, Serde)]
pub struct AggregatedEffect {
    #[key]
    pub village_id: u32,
    #[key]
    pub effect_type: EffectType,
    #[key]
    pub target_resource: ResourceType,
    pub value: i128,                // ×1000 aggregated total
    pub last_computed_tick: u64,
}

use autonomous_world::types::DiplomacyStatus;

/// Diplomatic relation between two villages.
/// Always stored with village_a < village_b to avoid duplicates.
#[dojo::model]
#[derive(Drop, Serde)]
pub struct DiplomaticRelation {
    #[key]
    pub village_a: u32,
    #[key]
    pub village_b: u32,
    pub status: DiplomacyStatus,
    pub updated_at_tick: u64,
}

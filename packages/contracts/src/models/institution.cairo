use starknet::ContractAddress;
use autonomous_world::types::{InstitutionType, EffectType};

/// An institution (Layer 3) — cross-village organization.
#[dojo::model]
#[derive(Drop, Serde)]
pub struct Institution {
    #[key]
    pub institution_id: u32,
    pub institution_type: InstitutionType,
    pub founder_address: ContractAddress,
    pub name_hash: felt252,
    pub founded_at_tick: u64,
    pub relevance: u128,
    pub member_count: u32,
    pub effect_count: u8,
    pub requirement_count: u8,
}

/// Effect slot for an institution.
#[dojo::model]
#[derive(Drop, Serde)]
pub struct InstitutionEffect {
    #[key]
    pub institution_id: u32,
    #[key]
    pub effect_index: u8,
    pub effect_type: EffectType,
    pub value: i128,
}

/// Join requirement for an institution.
/// req_type: 0=min_population, 1=has_tech, 2=has_building, 3=min_culture
#[dojo::model]
#[derive(Drop, Serde)]
pub struct JoinRequirement {
    #[key]
    pub institution_id: u32,
    #[key]
    pub req_index: u8,
    pub req_type: u8,
    pub param: u32,         // population threshold, tech_id, building_def_id, or culture ×1000
}

/// Membership tracking.
#[dojo::model]
#[derive(Drop, Serde)]
pub struct InstitutionMembership {
    #[key]
    pub institution_id: u32,
    #[key]
    pub village_id: u32,
    pub is_member: bool,
    pub joined_at_tick: u64,
}

/// Counter for institution IDs (singleton).
#[dojo::model]
#[derive(Drop, Serde)]
pub struct InstitutionCounter {
    #[key]
    pub id: u8,
    pub count: u32,
}

/// Number of institutions a village belongs to.
#[dojo::model]
#[derive(Drop, Serde)]
pub struct VillageInstitutionCount {
    #[key]
    pub village_id: u32,
    pub count: u32,
}

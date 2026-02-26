use starknet::ContractAddress;

/// Core village state — resources, population, research, culture, score.
/// All resource values use ×1000 fixed-point (e.g. 500 = 0.5).
#[dojo::model]
#[derive(Drop, Serde)]
pub struct Village {
    #[key]
    pub village_id: u32,
    pub owner: ContractAddress,
    // ── Resources (×1000 fixed-point) ──
    pub food: u128,
    pub wood: u128,
    pub stone: u128,
    pub iron: u128,
    pub gold: u128,
    // ── Storage caps (×1000) ──
    pub storage_food: u128,
    pub storage_wood: u128,
    pub storage_stone: u128,
    pub storage_iron: u128,
    pub storage_gold: u128,
    // ── Population ──
    pub population: u32,
    pub housing_capacity: u32,
    // ── Research & Culture (×1000) ──
    pub research_points: u128,
    pub culture_points: u128,
    pub total_culture_points: u128,
    // ── Score ──
    pub score: u32,
    // ── Timing ──
    pub founded_at_tick: u64,
    pub last_tick: u64,
}

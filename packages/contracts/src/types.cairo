// ============================================================
//  types.cairo — Autonomous World shared enum/struct definitions
// ============================================================

// ── Resource Types ──────────────────────────────────────────

#[derive(Drop, Copy, Serde, Introspect, PartialEq, Default)]
#[allow(starknet::store_no_default_variant)]
pub enum ResourceType {
    #[default]
    Food,
    Wood,
    Stone,
    Iron,
    Gold,
}

// ── Effect Types (18 types — Layer 0 fixed) ─────────────────

#[derive(Drop, Copy, Serde, Introspect, PartialEq, Default)]
#[allow(starknet::store_no_default_variant)]
pub enum EffectType {
    #[default]
    ResourceProduction,
    ResourceStorage,
    Housing,
    ResearchPoints,
    CulturePoints,
    TileYieldMod,
    AttackBonus,
    DefenseBonus,
    UnitTrainingSpeed,
    BuildSpeed,
    PopulationGrowth,
    FoodConsumptionMod,
    TradeIncome,
    VisionRange,
    Fortification,
    HealPerTick,
    UnlockUnit,
    UnlockBuilding,
}

// ── Covenant Clause Types ───────────────────────────────────

#[derive(Drop, Copy, Serde, Introspect, PartialEq, Default)]
#[allow(starknet::store_no_default_variant)]
pub enum ClauseType {
    #[default]
    TaxRate,
    TradeTariff,
    Conscription,
    ResourceSharing,
    BuildingBan,
    BuildingSubsidy,
    ResearchFocus,
    MilitaryPact,
    NonAggression,
    Tribute,
    ImmigrationPolicy,
    Rationing,
    Festival,
}

// ── Covenant Scope ──────────────────────────────────────────

#[derive(Drop, Copy, Serde, Introspect, PartialEq, Default)]
#[allow(starknet::store_no_default_variant)]
pub enum CovenantScope {
    #[default]
    Village,
    Bilateral,
    Global,
}

// ── Institution Types ───────────────────────────────────────

#[derive(Drop, Copy, Serde, Introspect, PartialEq, Default)]
#[allow(starknet::store_no_default_variant)]
pub enum InstitutionType {
    #[default]
    Guild,
    Religion,
    Alliance,
    Academy,
    Custom,
}

// ── Invention Types ─────────────────────────────────────────

#[derive(Drop, Copy, Serde, Introspect, PartialEq, Default)]
#[allow(starknet::store_no_default_variant)]
pub enum InventionType {
    #[default]
    Building,
    Tech,
    Unit,
}

// ── Diplomacy Status ────────────────────────────────────────

#[derive(Drop, Copy, Serde, Introspect, PartialEq, Default)]
#[allow(starknet::store_no_default_variant)]
pub enum DiplomacyStatus {
    #[default]
    Neutral,
    Friendly,
    Allied,
    Hostile,
    War,
}

// ── Unit Tags ───────────────────────────────────────────────

#[derive(Drop, Copy, Serde, Introspect, PartialEq, Default)]
#[allow(starknet::store_no_default_variant)]
pub enum UnitTag {
    #[default]
    Melee,
    Ranged,
    Cavalry,
    AntiCavalry,
    Siege,
    Elite,
}

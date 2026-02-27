/// Trade offer between two villages.
/// Resources use ×1000 fixed-point (u128).
/// status: 0=pending, 1=accepted, 2=cancelled, 3=completed
#[dojo::model]
#[derive(Drop, Serde)]
pub struct TradeOffer {
    #[key]
    pub trade_id: u32,
    pub from_village: u32,
    pub to_village: u32,
    // Offered resources (×1000 fixed-point)
    pub offer_food: u128,
    pub offer_wood: u128,
    pub offer_stone: u128,
    pub offer_iron: u128,
    pub offer_gold: u128,
    // Requested resources (×1000 fixed-point)
    pub request_food: u128,
    pub request_wood: u128,
    pub request_stone: u128,
    pub request_iron: u128,
    pub request_gold: u128,
    // Status
    pub status: u8,
    pub created_at_tick: u64,
}

/// Recurring trade route between two villages.
#[dojo::model]
#[derive(Drop, Serde)]
pub struct TradeRoute {
    #[key]
    pub route_id: u32,
    pub from_village: u32,
    pub to_village: u32,
    // Resources per tick (×1000 fixed-point)
    pub send_food: u128,
    pub send_wood: u128,
    pub send_stone: u128,
    pub send_iron: u128,
    pub send_gold: u128,
    pub recv_food: u128,
    pub recv_wood: u128,
    pub recv_stone: u128,
    pub recv_iron: u128,
    pub recv_gold: u128,
    // Active flag
    pub active: bool,
    pub created_at_tick: u64,
}

/// Global trade counter for auto-incrementing IDs.
#[dojo::model]
#[derive(Drop, Serde)]
pub struct TradeCounter {
    #[key]
    pub singleton: u8,  // always 0
    pub next_trade_id: u32,
    pub next_route_id: u32,
}

pub mod types;

pub mod models {
    pub mod village;
    pub mod building;
    pub mod technology;
    pub mod military;
    pub mod covenant;
    pub mod invention;
    pub mod institution;
    pub mod diplomacy;
    pub mod config;
    pub mod effect;
}

pub mod systems {
    pub mod physics;
    pub mod village_tick;
    pub mod commands;
    pub mod combat;
    pub mod covenant;
    pub mod invention;
    pub mod institution;
    pub mod victory;
    pub mod setup;
}

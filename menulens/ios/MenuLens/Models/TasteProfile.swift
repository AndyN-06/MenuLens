import Foundation

struct TasteProfile: Codable {
    let id: String?
    let userId: String?
    var cuisineAffinities: [String: Double]?
    var likedIngredients: [String]?
    var dislikedIngredients: [String]?
    var flavorTags: [String]?
    var dietaryRestrictions: [String]?
    var topDishes: [String]?
    var avgScoreThreshold: Double?

    enum CodingKeys: String, CodingKey {
        case id
        case userId              = "user_id"
        case cuisineAffinities   = "cuisine_affinities"
        case likedIngredients    = "liked_ingredients"
        case dislikedIngredients = "disliked_ingredients"
        case flavorTags          = "flavor_tags"
        case dietaryRestrictions = "dietary_restrictions"
        case topDishes           = "top_dishes"
        case avgScoreThreshold   = "avg_score_threshold"
    }
}

struct CreateProfileRequest: Encodable {
    let favoriteCuisines: [String]
    let dietaryRestrictions: [String]
    let flavorTags: [String]

    enum CodingKeys: String, CodingKey {
        case favoriteCuisines    = "favorite_cuisines"
        case dietaryRestrictions = "dietary_restrictions"
        case flavorTags          = "flavor_tags"
    }
}

// Cuisines shown during onboarding
extension TasteProfile {
    static let allCuisines: [(name: String, emoji: String)] = [
        ("Italian", "🍕"), ("Japanese", "🍣"), ("Mexican", "🌮"),
        ("Chinese", "🥟"), ("Indian", "🍛"), ("Thai", "🍜"),
        ("American", "🍔"), ("French", "🥐"), ("Korean", "🍱"),
        ("Mediterranean", "🫒"), ("Vietnamese", "🍲"), ("Greek", "🥙"),
        ("Spanish", "🥘"), ("Middle Eastern", "🧆"), ("Ethiopian", "🫓")
    ]

    static let allFlavorTags: [String] = [
        "Spicy", "Sweet", "Savory", "Umami", "Rich", "Light",
        "Sour", "Smoky", "Herby", "Creamy", "Crispy", "Fresh"
    ]
}

import Foundation

struct Dish: Codable, Identifiable {
    // When returned from DB the dish has a UUID; from parsed-only it may be nil
    var id: String?
    let dishName: String
    let description: String?
    let price: String?
    let section: String?

    // Scoring fields (populated after ranking)
    var score: Double?
    var matchLevel: String?   // "great" | "good" | "skip"
    var communityPick: Bool?
    var flavorVector: FlavorVector?
    var baseIngredients: [String]?

    enum CodingKeys: String, CodingKey {
        case id
        case dishName       = "dish_name"
        case description
        case price
        case section
        case score
        case matchLevel     = "match_level"
        case communityPick  = "community_pick"
        case flavorVector   = "flavor_vector"
        case baseIngredients = "base_ingredients"
    }

    // Stable Identifiable id (falls back to dish name if no UUID)
    var stableId: String { id ?? dishName }
}

struct FlavorVector: Codable {
    var umami: Double?
    var salty: Double?
    var sweet: Double?
    var bitter: Double?
    var sour: Double?
    var spicy: Double?
    var richness: Double?
}

struct ParsedMenu: Decodable {
    let restaurantName: String?
    let cuisineType: String?
    let dishes: [Dish]

    enum CodingKeys: String, CodingKey {
        case restaurantName = "restaurant_name"
        case cuisineType    = "cuisine_type"
        case dishes
    }
}

struct StreamEvent: Decodable {
    let type: String          // "log" | "parsed" | "error"
    let message: String?
    let data: ParsedMenu?
}

struct RankRequest: Encodable {
    let dishes: [Dish]
    let restaurantName: String
    let cuisineType: String?
    let userId: String

    enum CodingKeys: String, CodingKey {
        case dishes
        case restaurantName = "restaurant_name"
        case cuisineType    = "cuisine_type"
        case userId         = "user_id"
    }
}

struct RankResponse: Decodable {
    let ranked: Bool
    let dishes: [Dish]
    let dishCount: Int?
    let communityCount: Int?

    enum CodingKeys: String, CodingKey {
        case ranked
        case dishes
        case dishCount      = "dish_count"
        case communityCount = "community_count"
    }
}

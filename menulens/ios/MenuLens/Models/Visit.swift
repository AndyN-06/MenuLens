import Foundation

struct Visit: Codable, Identifiable {
    let id: String
    let userId: String?
    let restaurantId: String?
    var restaurantRating: Int?
    let visitedAt: String?
    var restaurantName: String?
    var cuisineType: String?

    enum CodingKeys: String, CodingKey {
        case id
        case userId          = "user_id"
        case restaurantId    = "restaurant_id"
        case restaurantRating = "restaurant_rating"
        case visitedAt       = "visited_at"
        case restaurantName  = "restaurant_name"
        case cuisineType     = "cuisine_type"
    }
}

struct CreateVisitRequest: Encodable {
    let restaurantId: String
    let menuId: String?

    enum CodingKeys: String, CodingKey {
        case restaurantId = "restaurant_id"
        case menuId       = "menu_id"
    }
}

struct CreateVisitResponse: Decodable {
    let visitId: String

    enum CodingKeys: String, CodingKey {
        case visitId = "visit_id"
    }
}

struct DishRating: Encodable {
    let dishName: String
    let rating: Int
    var notes: String?

    enum CodingKeys: String, CodingKey {
        case dishName = "dish_name"
        case rating
        case notes
    }
}

struct SubmitRatingsRequest: Encodable {
    let ratings: [DishRating]
    var restaurantRating: Int?

    enum CodingKeys: String, CodingKey {
        case ratings
        case restaurantRating = "restaurant_rating"
    }
}

struct VisitsResponse: Decodable {
    let visits: [Visit]
}

// Local pending visit stored in UserDefaults before submission
struct PendingVisit: Codable, Identifiable {
    let id: String           // local UUID
    let restaurantName: String
    let cuisineType: String?
    let dishes: [Dish]
    let scannedAt: Date
}

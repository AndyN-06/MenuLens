import Foundation

struct Restaurant: Codable, Identifiable {
    let id: String
    let name: String
    let cuisineType: String?
    let city: String?
    let address: String?

    enum CodingKeys: String, CodingKey {
        case id
        case name
        case cuisineType = "cuisine_type"
        case city
        case address
    }
}

struct RestaurantSearchResponse: Decodable {
    let restaurants: [Restaurant]
}

struct CreateRestaurantRequest: Encodable {
    let name: String
    let cuisineType: String?
    let city: String?

    enum CodingKeys: String, CodingKey {
        case name
        case cuisineType = "cuisine_type"
        case city
    }
}
